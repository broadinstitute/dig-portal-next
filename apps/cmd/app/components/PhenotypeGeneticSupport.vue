<script setup lang="ts">
import type { Phenotype, PigeanModel } from '@dig-portal/domain'
import {
  associationPage, filterGeneSupportRows, geneticSupportCsv, geneSupportMinimumError, geneSupportQuery,
  geneSupportQueryKeys, geneSupportRows, readGeneSupportState, readPhenotypeRouteState, sortGeneSupportRows,
  type GeneSupportState,
} from '@dig-portal/feature-phenotype'

const props = defineProps<{ phenotype: Phenotype, model: PigeanModel }>()
const route = useRoute()
const router = useRouter()
const client = useBioIndex()
const state = computed(() => readGeneSupportState(route.query))
const pigeanKey = computed(() => `pigean-support:${JSON.stringify([props.phenotype.name, props.model])}`)
const hugeKey = computed(() => `huge-support:${props.phenotype.name}`)
const falconKey = computed(() => `falcon-support:${props.phenotype.name}`)
const { data: pigean, status: pigeanStatus, error: pigeanError, refresh: refreshPigean } = useLazyAsyncData(
  pigeanKey, (_nuxtApp, { signal }) => client.pigeanGeneSupport(props.phenotype.name, props.model, { signal }), { server: false },
)
const { data: huge, status: hugeStatus, error: hugeError, refresh: refreshHuge } = useLazyAsyncData(
  hugeKey, (_nuxtApp, { signal }) => client.hugeGeneScores(props.phenotype.name, { signal }), { server: false },
)
const { data: falcon, status: falconStatus, error: falconError, refresh: refreshFalcon } = useLazyAsyncData(
  falconKey, (_nuxtApp, { signal }) => client.falconGeneProbabilities(props.phenotype.name, { signal }), { server: false },
)
const rows = computed(() => geneSupportRows(
  pigeanStatus.value === 'success' && !pigeanError.value ? pigean.value?.data ?? [] : [],
  hugeStatus.value === 'success' && !hugeError.value ? huge.value?.data ?? [] : [],
  falconStatus.value === 'success' && !falconError.value ? falcon.value?.data ?? [] : [],
  state.value.tab,
))
const mainError = computed(() => state.value.tab === 'huge' ? hugeError.value
  : pigeanError.value || (state.value.tab === 'comparison' ? hugeError.value : null))
const ready = computed(() => state.value.tab === 'huge' ? hugeStatus.value === 'success'
  : pigeanStatus.value === 'success' && (state.value.tab !== 'comparison' || hugeStatus.value === 'success'))
const minimumError = computed(() => geneSupportMinimumError(state.value.minimum, state.value.tab))
const filtered = computed(() => minimumError.value ? [] : filterGeneSupportRows(rows.value, state.value))
const sorted = computed(() => sortGeneSupportRows(filtered.value, state.value))
const page = computed(() => associationPage(sorted.value, state.value.page, 10))
const geneItems = computed(() => {
  const genes = new Set(rows.value.map(({ gene }) => gene))
  if (state.value.gene) genes.add(state.value.gene)
  return [{ value: '__all__', label: 'All genes' }, ...[...genes].sort().map((gene) => ({ value: gene, label: gene }))]
})
const tabs = [
  { value: 'combined', label: 'Combined support' }, { value: 'huge', label: 'HuGE scores' },
  { value: 'comparison', label: 'Combined support vs HuGE' }, { value: 'direct-indirect', label: 'Direct vs indirect' },
]
const sortItems = computed(() => {
  const options = [{ value: 'gene', label: 'Gene' }]
  if (state.value.tab !== 'huge') options.push({ value: 'combined', label: 'Combined support' })
  if (state.value.tab === 'combined' || state.value.tab === 'direct-indirect') options.push({ value: 'direct', label: 'Direct support' }, { value: 'indirect', label: 'Indirect support' })
  if (state.value.tab === 'combined') options.push({ value: 'pip', label: 'FALCON PIP' })
  if (state.value.tab === 'huge' || state.value.tab === 'comparison') options.push({ value: 'huge', label: 'HuGE score' })
  if (state.value.tab === 'huge') options.push({ value: 'common', label: 'Common-variant BF' }, { value: 'rare', label: 'Rare-variant BF' })
  return options
})
const detailGene = ref<string | null>(null)
const downloadError = ref(false)
const legacyUrl = computed(() => {
  const ancestry = readPhenotypeRouteState(route.query).ancestry
  return `https://hugeamp.org/phenotype.html?${new URLSearchParams({ phenotype: props.phenotype.name, ...(ancestry ? { ancestry } : {}) })}`
})

function update(patch: Partial<GeneSupportState>) {
  const query = { ...route.query }
  for (const key of geneSupportQueryKeys) delete query[key]
  Object.assign(query, geneSupportQuery({ ...state.value, ...patch, page: patch.page ?? 1 }))
  detailGene.value = null
  router.replace({ query, hash: route.hash })
}
function changeTab(value: string | number) {
  const tab = readGeneSupportState({ supportTab: String(value) }).tab
  update({ tab, sort: tab === 'huge' ? 'huge' : 'combined', order: 'desc', minimum: '' })
}
function changeSort(value: string) {
  update({ sort: readGeneSupportState({ ...route.query, supportSort: value }).sort })
}
function download() {
  downloadError.value = false
  let url: string | undefined
  let anchor: HTMLAnchorElement | undefined
  try {
    // D-11: browser access is confined to this user event.
    url = URL.createObjectURL(new Blob([geneticSupportCsv(sorted.value)], { type: 'text/csv;charset=utf-8' }))
    anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${props.phenotype.name}-${state.value.tab}-gene-support.csv`.replace(/[^A-Za-z0-9._-]/g, '_')
    document.body.append(anchor)
    anchor.click()
  } catch { downloadError.value = true }
  finally {
    anchor?.remove()
    if (url) { const downloadUrl = url; setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000) }
  }
}
</script>

<template>
  <section class="mt-10 space-y-5" aria-labelledby="genetic-support-heading">
    <div class="space-y-2">
      <h2 id="genetic-support-heading" class="text-xl font-semibold">Genes with genetic support for {{ phenotype.description }}</h2>
      <p class="text-sm text-muted">Direct support reflects nearby genetic associations. Indirect support reflects gene annotations; combined support includes both. These gene-level results are not ancestry-specific, so the ancestry selector does not filter this section.</p>
      <a href="https://hugeamp.org/birds.html" class="text-sm text-primary underline">About FALCON, PIGEAN, and EAGGL</a>
    </div>
    <div class="space-y-3" aria-label="Gene-support data coverage">
      <GeneticSupportSourceStatus label="PIGEAN" :status="pigeanStatus" :error="pigeanError" :result="pigean" @retry="refreshPigean()" />
      <GeneticSupportSourceStatus label="HuGE" :status="hugeStatus" :error="hugeError" :result="huge" @retry="refreshHuge()" />
      <GeneticSupportSourceStatus label="FALCON" :status="falconStatus" :error="falconError" :result="falcon" @retry="refreshFalcon()" />
    </div>
    <UTabs :model-value="state.tab" :items="tabs" @update:model-value="changeTab">
      <template #content>
        <div class="space-y-5 pt-4">
          <UAlert v-if="mainError" color="error" title="Results for this tab could not be loaded" description="Retry the unavailable data source above, or choose another tab." />
          <p v-else-if="!ready" role="status" class="text-muted">Loading gene-support results…</p>
          <template v-else>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <UFormField label="Gene"><USelectMenu :model-value="state.gene || '__all__'" :items="geneItems" value-key="value" virtualize class="w-full" @update:model-value="value => update({ gene: value === '__all__' ? '' : value })" /></UFormField>
              <UFormField :label="state.tab === 'huge' ? 'Minimum HuGE score' : 'Minimum combined support'" :error="minimumError ?? undefined"><UInput :model-value="state.minimum" placeholder="No additional filter" class="w-full" @update:model-value="value => update({ minimum: String(value ?? '') })" /></UFormField>
              <UFormField label="Sort gene support by"><USelect :model-value="state.sort" :items="sortItems" class="w-full" @update:model-value="changeSort" /></UFormField>
              <UFormField label="Gene support order"><USelect :model-value="state.order" :items="[{ value: 'desc', label: 'Descending' }, { value: 'asc', label: 'Ascending' }]" class="w-full" @update:model-value="value => update({ order: value === 'asc' ? 'asc' : 'desc' })" /></UFormField>
            </div>
            <UButton color="neutral" variant="outline" @click="update({ gene: '', minimum: '' })">Reset gene filters</UButton>
            <p v-if="minimumError" role="status" class="text-error">Correct the minimum-score filter to view or export results.</p>
            <template v-else>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <p role="status" class="text-sm text-muted">{{ sorted.length.toLocaleString() }} matching rows of {{ rows.length.toLocaleString() }} returned.</p>
                <UButton color="neutral" variant="outline" :disabled="!sorted.length" @click="download">Download gene-support CSV</UButton>
              </div>
              <p v-if="downloadError" role="status" class="text-error">The CSV download could not be started.</p>
              <p v-if="!rows.length" class="text-muted">No gene-support records were returned for this tab.</p>
              <p v-else-if="!sorted.length" class="text-muted">No genes match these filters.</p>
              <template v-else>
                <p v-if="state.tab === 'huge'" class="text-xs text-muted">HuGE score guide: ≥350 compelling; ≥100 extreme; ≥30 very strong; ≥10 strong; ≥3 moderate; >1 anecdotal; ≤1 no evidence.</p>
                <p v-else class="text-xs text-muted">Reported support score guide: >3 very strong; 2–3 strongly suggestive; 1–&lt;2 nominally significant; &lt;1 not significant.</p>
                <GeneticSupportPlot :rows="sorted" :tab="state.tab" />
                <GeneticSupportTable :rows="page.records" :tab="state.tab" @gene-sets="gene => detailGene = gene" />
                <nav class="flex flex-wrap items-center justify-between gap-3" aria-label="Gene-support result pages">
                  <p role="status" class="text-sm text-muted">Rows {{ page.start }}–{{ page.end }} · Page {{ page.page }} of {{ page.pages }}</p>
                  <div class="flex gap-2"><UButton color="neutral" variant="outline" :disabled="page.page === 1" @click="update({ page: page.page - 1 })">Previous genes</UButton><UButton color="neutral" variant="outline" :disabled="page.page === page.pages" @click="update({ page: page.page + 1 })">Next genes</UButton></div>
                </nav>
              </template>
            </template>
          </template>
        </div>
      </template>
    </UTabs>
    <div v-if="detailGene" class="space-y-3">
      <UButton color="neutral" variant="outline" @click="detailGene = null">Close gene-set evidence</UButton>
      <PigeanGeneSetEvidence :key="detailGene" :gene="detailGene" :phenotype="phenotype.name" :model="model" />
    </div>
    <p class="text-xs text-muted">PIGEAN model: σ={{ model.sigma }}, annotation collection {{ model.geneSetCollection }}. Comparisons use the highest returned HuGE score per exact gene ID; the HuGE tab retains every returned locus. HuGE is transformed with the natural logarithm only in plots. FALCON PIP is the highest returned probability per exact gene ID. Missing matches are not treated as zero. CSV retains unrounded statistics for all filtered rows.</p>
    <div class="space-y-2 rounded-lg border border-default p-4">
      <h3 class="font-medium">Regional evidence</h3>
      <p class="text-sm text-muted">Regional evidence plots remain available in the genetic-support section of the legacy phenotype page.</p>
      <a :href="legacyUrl" class="text-primary underline">View regional evidence on the legacy portal</a>
    </div>
  </section>
</template>
