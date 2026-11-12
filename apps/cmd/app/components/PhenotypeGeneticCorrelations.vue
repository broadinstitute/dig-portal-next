<script setup lang="ts">
import { ancestryLabel, type Phenotype } from '@dig-portal/domain'
import { associationPage, correlationFilterError, correlationPhenotypeLabel, correlationQueryKeys, correlationTableQuery, eligibleGeneticCorrelations, filterGeneticCorrelations, geneticCorrelationsCsv, readCorrelationTableState, sortGeneticCorrelations, type CorrelationTableState } from '@dig-portal/feature-phenotype'

const props = defineProps<{ phenotype: Phenotype, phenotypes: readonly Phenotype[], ancestry: string }>()
const route = useRoute()
const router = useRouter()
const client = useBioIndex()
const state = computed(() => readCorrelationTableState(route.query))
const key = computed(() => `genetic-correlations:${JSON.stringify([props.phenotype.name, props.ancestry])}`)
const { data: result, status, error, refresh } = useLazyAsyncData(key,
  (_nuxtApp, { signal }) => client.geneticCorrelations(props.phenotype.name, props.ancestry, { signal }), { server: false })
const records = computed(() => result.value?.data ?? [])
const eligible = computed(() => eligibleGeneticCorrelations(records.value, props.phenotypes))
const filterError = computed(() => correlationFilterError(state.value))
const filtered = computed(() => filterError.value ? [] : filterGeneticCorrelations(eligible.value, state.value))
const sorted = computed(() => sortGeneticCorrelations(filtered.value, state.value, props.phenotypes))
const page = computed(() => associationPage(sorted.value, state.value.page, 10))
const phenotypeItems = computed(() => [...new Set([...eligible.value.map(({ otherPhenotype }) => otherPhenotype), ...state.value.phenotypes])]
  .map((value) => ({ value, label: correlationPhenotypeLabel(value, props.phenotypes) })).sort((a, b) => a.label.localeCompare(b.label)))
const downloadError = ref(false)

function update(patch: Partial<CorrelationTableState>) {
  const query = { ...route.query }
  for (const key of correlationQueryKeys) delete query[key]
  Object.assign(query, correlationTableQuery({ ...state.value, ...patch, page: patch.page ?? 1 }))
  router.replace({ query, hash: route.hash })
}
function sort(field: CorrelationTableState['sort']) {
  update({ sort: field, order: state.value.sort === field && state.value.order === 'asc' ? 'desc' : 'asc' })
}
function download() {
  downloadError.value = false
  let url: string | undefined, anchor: HTMLAnchorElement | undefined
  try {
    url = URL.createObjectURL(new Blob([geneticCorrelationsCsv(sorted.value)], { type: 'text/csv;charset=utf-8' }))
    anchor = document.createElement('a'); anchor.href = url
    anchor.download = `${props.phenotype.name}-${props.ancestry || 'all'}-genetic-correlations.csv`.replace(/[^A-Za-z0-9._-]/g, '_')
    document.body.append(anchor); anchor.click()
  } catch { downloadError.value = true }
  finally { anchor?.remove(); if (url) { const downloadUrl = url; setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000) } }
}
</script>

<template>
  <section class="mt-10 space-y-4" aria-labelledby="correlations-heading">
    <h2 id="correlations-heading" class="text-xl font-semibold">Genetic correlations</h2>
    <p class="text-sm text-muted">{{ phenotype.description }} · {{ ancestry ? ancestryLabel(ancestry) : 'All ancestries' }}. Estimates are shown as reported, including values outside −1 to 1. Up to 1,000 records are requested.</p>
    <GeneticSupportSourceStatus label="Genetic correlations" :status="status" :error="error" :result="result" @retry="refresh()" />
    <template v-if="status === 'success' && !error && result">
      <p class="text-sm text-muted">{{ records.length - eligible.length }} returned records for phenotypes outside this portal excluded. Filters, counts, and CSV use the remaining returned records.</p>
      <div class="grid gap-4 sm:grid-cols-3">
        <UFormField label="Correlated phenotypes"><USelectMenu :model-value="[...state.phenotypes]" :items="phenotypeItems" value-key="value" multiple placeholder="All phenotypes" class="w-full" @update:model-value="value => update({ phenotypes: value })" /></UFormField>
        <UFormField label="Correlation p-value (≤)"><UInput :model-value="state.pValue" placeholder="No maximum" class="w-full" @update:model-value="value => update({ pValue: String(value ?? '') })" /></UFormField>
        <UFormField label="Minimum correlation (≥)"><UInput :model-value="state.minimum" placeholder="No minimum" class="w-full" @update:model-value="value => update({ minimum: String(value ?? '') })" /></UFormField>
      </div>
      <UButton color="neutral" variant="outline" @click="update({ phenotypes: [], pValue: '', minimum: '' })">Reset correlation filters</UButton>
      <p v-if="filterError" role="status" class="text-error">{{ filterError }}</p>
      <template v-else>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p role="status" class="text-sm text-muted">{{ sorted.length.toLocaleString() }} matching rows of {{ eligible.length.toLocaleString() }} eligible returned records. Select a column heading to sort.</p>
          <UButton color="neutral" variant="outline" :disabled="!sorted.length" @click="download">Download correlations CSV</UButton>
        </div>
        <p v-if="downloadError" role="status" class="text-error">The CSV download could not be started.</p>
        <p v-if="!records.length" class="text-muted">No genetic correlations were returned for this phenotype and ancestry.</p>
        <p v-else-if="!eligible.length" class="text-muted">No returned correlations involve another phenotype in this portal.</p>
        <p v-else-if="!sorted.length" class="text-muted">No genetic correlations match these filters.</p>
        <template v-else>
          <GeneticCorrelationsTable :rows="page.records" :phenotypes="phenotypes" :ancestry="ancestry" :sort="state.sort" :order="state.order" @sort="sort" />
          <p class="text-xs text-muted">CSV retains unrounded statistics and phenotype identifiers. Phenotype links keep the selected ancestry and reset section filters.</p>
          <nav class="flex flex-wrap items-center justify-between gap-3" aria-label="Genetic correlation result pages">
            <p>Rows {{ page.start }}–{{ page.end }} · Page {{ page.page }} of {{ page.pages }}</p>
            <div class="flex gap-2"><UButton color="neutral" variant="outline" :disabled="page.page === 1" @click="update({ page: page.page - 1 })">Previous correlations</UButton><UButton color="neutral" variant="outline" :disabled="page.page === page.pages" @click="update({ page: page.page + 1 })">Next correlations</UButton></div>
          </nav>
        </template>
      </template>
    </template>
  </section>
</template>
