<script setup lang="ts">
import { ancestryLabel, type Phenotype } from '@dig-portal/domain'
import { associationPage, cs2ctCsv, cs2ctEligibleRows, cs2ctFilterError, cs2ctLabel, cs2ctQuery, cs2ctQueryKeys, cs2ctTissueKey, filterCs2ctRows, readCs2ctState, sortCs2ctRows, type Cs2ctState } from '@dig-portal/feature-phenotype'

const props = defineProps<{ phenotype: Phenotype, ancestry: string }>()
const route = useRoute()
const router = useRouter()
const client = useBioIndex()
const state = computed(() => readCs2ctState(route.query))
const { data: annotations, status: annotationStatus, error: annotationError, refresh: refreshAnnotations } = useLazyAsyncData(
  'cs2ct-annotations', (_nuxtApp, { signal }) => client.cs2ctAnnotations({ signal }), { server: false, default: (): string[] => [] },
)
const annotation = computed(() => state.value.annotation || annotations.value[0] || '')
const knownAnnotation = computed(() => annotationStatus.value === 'success' && !annotationError.value && annotations.value.includes(annotation.value))
const annotationItems = computed(() => [...new Set([...annotations.value, ...(state.value.annotation ? [state.value.annotation] : [])])].map((value) => ({ value, label: cs2ctLabel(value) })))
const key = computed(() => `cs2ct:${JSON.stringify([props.phenotype.name, props.ancestry, knownAnnotation.value ? annotation.value : ''])}`)
const { data: result, status, error, refresh } = useLazyAsyncData(key,
  (_nuxtApp, { signal }) => knownAnnotation.value ? client.cs2ct(props.phenotype.name, props.ancestry, annotation.value, { signal }) : Promise.resolve(null), { server: false },
)
const records = computed(() => result.value?.data ?? [])
const eligible = computed(() => cs2ctEligibleRows(records.value))
const filterError = computed(() => cs2ctFilterError(state.value))
const filtered = computed(() => filterError.value ? [] : filterCs2ctRows(eligible.value, state.value))
const sorted = computed(() => sortCs2ctRows(filtered.value, state.value))
const page = computed(() => associationPage(sorted.value, state.value.page, 10))
const sourceItems = computed(() => [...new Set([...eligible.value.map(({ source }) => source), ...state.value.sources])].sort().map((value) => ({ value, label: cs2ctLabel(value) })))
const tissueItems = computed(() => [...new Set([...eligible.value.map(cs2ctTissueKey), ...state.value.tissues])].sort().map((value) => ({ value, label: cs2ctLabel(value) })))
const sortItems = [
  { value: 'score', label: 'Combined score' }, { value: 'overlapProbability', label: 'Overlap probability' },
  { value: 'genericity', label: 'Genericity' }, { value: 'variantCount', label: 'Variants' }, { value: 'tissue', label: 'Tissue' },
  { value: 'biosample', label: 'Biosample' }, { value: 'source', label: 'Source' },
]
const downloadError = ref(false)
function update(patch: Partial<Cs2ctState>) {
  const query = { ...route.query }
  for (const key of cs2ctQueryKeys) delete query[key]
  Object.assign(query, cs2ctQuery({ ...state.value, ...patch, page: patch.page ?? 1 }))
  router.replace({ query, hash: route.hash })
}
function download() {
  downloadError.value = false
  let url: string | undefined, anchor: HTMLAnchorElement | undefined
  try {
    url = URL.createObjectURL(new Blob([cs2ctCsv(sorted.value)], { type: 'text/csv;charset=utf-8' }))
    anchor = document.createElement('a'); anchor.href = url
    anchor.download = `${props.phenotype.name}-${props.ancestry || 'all'}-${annotation.value}-cs2ct.csv`.replace(/[^A-Za-z0-9._-]/g, '_')
    document.body.append(anchor); anchor.click()
  } catch { downloadError.value = true }
  finally { anchor?.remove(); if (url) { const downloadUrl = url; setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000) } }
}
</script>

<template>
  <section class="mt-10 space-y-4" aria-labelledby="cs2ct-heading">
    <h2 id="cs2ct-heading" class="text-xl font-semibold">Credible Sets to Cell Type (CS2CT)</h2>
    <p class="text-sm text-muted">{{ phenotype.description }} · {{ ancestry ? ancestryLabel(ancestry) : 'All ancestries' }}. Explore credible-set overlap with cell-type annotations.</p>
    <p v-if="annotationStatus === 'idle' || annotationStatus === 'pending'" role="status">Loading CS2CT annotations…</p>
    <div v-else-if="annotationError" class="space-y-3"><UAlert color="error" title="CS2CT annotations could not be loaded" /><UButton color="neutral" variant="outline" @click="refreshAnnotations()">Retry annotations</UButton></div>
    <p v-else-if="!annotations.length" class="text-muted">No CS2CT annotations are available.</p>
    <template v-else>
      <UFormField label="CS2CT annotation"><USelect :model-value="annotation" :items="annotationItems" class="w-full sm:w-80" @update:model-value="value => update({ annotation: value, sources: [], tissues: [] })" /></UFormField>
      <UAlert v-if="!knownAnnotation" color="warning" title="Unknown CS2CT annotation" description="Choose an annotation from the available list." />
      <template v-else>
        <GeneticSupportSourceStatus label="CS2CT" :status="status" :error="error" :result="result" @retry="refresh()" />
        <template v-if="status === 'success' && !error && result">
          <p class="text-sm text-muted">{{ records.length - eligible.length }} rare-variant bottom-line records excluded, matching the legacy source rule. Filters, counts, and exports apply only to the remaining returned records.</p>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <UFormField label="CS2CT sources"><USelectMenu :model-value="[...state.sources]" :items="sourceItems" value-key="value" multiple placeholder="All sources" class="w-full" @update:model-value="value => update({ sources: value })" /></UFormField>
            <UFormField label="CS2CT tissues"><USelectMenu :model-value="[...state.tissues]" :items="tissueItems" value-key="value" multiple placeholder="All tissues" class="w-full" @update:model-value="value => update({ tissues: value })" /></UFormField>
            <UFormField label="Minimum variants (≥)"><UInput :model-value="state.minVariants" placeholder="No minimum" class="w-full" @update:model-value="value => update({ minVariants: String(value ?? '') })" /></UFormField>
            <UFormField label="Maximum genericity (≤)"><UInput :model-value="state.maxGenericity" placeholder="No maximum" class="w-full" @update:model-value="value => update({ maxGenericity: String(value ?? '') })" /></UFormField>
            <UFormField label="CS2CT sort by"><USelect :model-value="state.sort" :items="sortItems" class="w-full" @update:model-value="value => update({ sort: readCs2ctState({ csSort: value }).sort })" /></UFormField>
            <UFormField label="CS2CT order"><USelect :model-value="state.order" :items="[{ value: 'desc', label: 'Descending' }, { value: 'asc', label: 'Ascending' }]" class="w-full" @update:model-value="value => update({ order: value === 'asc' ? 'asc' : 'desc' })" /></UFormField>
          </div>
          <UButton color="neutral" variant="outline" @click="update({ sources: [], tissues: [], minVariants: '', maxGenericity: '' })">Reset CS2CT filters</UButton>
          <p v-if="filterError" role="status" class="text-error">{{ filterError }}</p>
          <template v-else>
            <div class="flex flex-wrap items-center justify-between gap-3"><p role="status" class="text-sm text-muted">{{ sorted.length.toLocaleString() }} matching rows of {{ eligible.length.toLocaleString() }} eligible returned records.</p><UButton color="neutral" variant="outline" :disabled="!sorted.length" @click="download">Download CS2CT CSV</UButton></div>
            <p v-if="downloadError" role="status" class="text-error">The CSV download could not be started.</p>
            <p v-if="!records.length" class="text-muted">No CS2CT records were returned for this query.</p>
            <p v-else-if="!eligible.length" class="text-muted">No records remain after the legacy source exclusion.</p>
            <p v-else-if="!sorted.length" class="text-muted">No CS2CT results match these filters.</p>
            <template v-else>
              <Cs2ctResultsTable :rows="page.records" />
              <p class="text-xs text-muted">CSV retains unrounded statistics and original tissue/biosample identifiers. Links open legacy tissue, variant, and Variant Sifter pages; Sifter regions span the overlap lead variant ±200 kb, clipped at position 1.</p>
              <nav class="flex flex-wrap items-center justify-between gap-3" aria-label="CS2CT result pages"><p>Rows {{ page.start }}–{{ page.end }} · Page {{ page.page }} of {{ page.pages }}</p><div class="flex gap-2"><UButton color="neutral" variant="outline" :disabled="page.page === 1" @click="update({ page: page.page - 1 })">Previous CS2CT rows</UButton><UButton color="neutral" variant="outline" :disabled="page.page === page.pages" @click="update({ page: page.page + 1 })">Next CS2CT rows</UButton></div></nav>
            </template>
          </template>
        </template>
      </template>
    </template>
  </section>
</template>
