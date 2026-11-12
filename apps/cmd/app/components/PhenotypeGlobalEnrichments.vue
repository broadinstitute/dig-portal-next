<script setup lang="ts">
import { ancestryLabel, type Phenotype } from '@dig-portal/domain'
import { associationPage, enrichmentFilterError, enrichmentLabel, enrichmentQueryKeys, enrichmentTableQuery, enrichmentValue, filterGlobalEnrichments, globalEnrichmentSelection, globalEnrichmentsCsv, readEnrichmentTableState, sortGlobalEnrichments, type EnrichmentTableState } from '@dig-portal/feature-phenotype'
const props = defineProps<{ phenotype: Phenotype, ancestry: string }>()
const route = useRoute(), router = useRouter(), client = useBioIndex()
const ALL = '__all__'
const state = computed(() => readEnrichmentTableState(route.query))
const key = computed(() => `global-enrichments:${JSON.stringify(props.phenotype.name)}`)
const { data: result, status, error, refresh } = useLazyAsyncData(key,
  (_nuxtApp, { signal }) => client.globalEnrichments(props.phenotype.name, { signal }), { server: false })
const selection = computed(() => globalEnrichmentSelection(result.value?.data ?? [], props.ancestry))
const filterError = computed(() => enrichmentFilterError(state.value))
const sorted = computed(() => sortGlobalEnrichments(filterError.value ? [] : filterGlobalEnrichments(selection.value.records, state.value), state.value))
const page = computed(() => associationPage(sorted.value, state.value.page, 10))
function items(field: 'annotation' | 'tissue') {
  return [{ value: ALL, label: 'All' }, ...[...new Set([...selection.value.records.map((row) => enrichmentValue(row[field])), ...(state.value[field] ? [state.value[field]] : [])])].sort().map((value) => ({ value, label: enrichmentLabel(value) }))]
}
const annotationItems = computed(() => items('annotation')), tissueItems = computed(() => items('tissue'))
const downloadError = ref(false)
function update(patch: Partial<EnrichmentTableState>) {
  const query = { ...route.query }
  for (const key of enrichmentQueryKeys) delete query[key]
  Object.assign(query, enrichmentTableQuery({ ...state.value, ...patch, page: patch.page ?? 1 }))
  router.replace({ query, hash: route.hash })
}
function sort(field: EnrichmentTableState['sort']) { update({ sort: field, order: state.value.sort === field && state.value.order === 'asc' ? 'desc' : 'asc' }) }
function download() {
  downloadError.value = false
  let url: string | undefined, anchor: HTMLAnchorElement | undefined
  try {
    url = URL.createObjectURL(new Blob([globalEnrichmentsCsv(sorted.value)], { type: 'text/csv;charset=utf-8' }))
    anchor = document.createElement('a'); anchor.href = url
    anchor.download = `${props.phenotype.name}-${props.ancestry || 'all'}-global-enrichments.csv`.replace(/[^A-Za-z0-9._-]/g, '_')
    document.body.append(anchor); anchor.click()
  } catch { downloadError.value = true }
  finally { anchor?.remove(); if (url) { const downloadUrl = url; setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000) } }
}
</script>

<template>
  <section class="mt-10 space-y-4" aria-labelledby="enrichments-heading">
    <h2 id="enrichments-heading" class="text-xl font-semibold">Globally enriched annotations</h2>
    <p class="text-sm text-muted">{{ phenotype.description }} · {{ ancestry ? ancestryLabel(ancestry) : 'All ancestries' }}. Up to 2,000 records are requested across ancestries; the selected ancestry is applied locally.</p>
    <GeneticSupportSourceStatus label="Global enrichment" :status="status" :error="error" :result="result" @retry="refresh()" />
    <template v-if="status === 'success' && !error && result">
      <p class="text-sm text-muted">{{ selection.records.length }} shortlisted rows from {{ selection.scope.length }} returned records for this ancestry selection. {{ selection.mode === 'significant' ? 'Showing records with p-value < 1e-5.' : 'Showing the best 20 p-values, or all available records when fewer than 20 exist.' }} Filters and CSV apply to this shortlist.</p>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UFormField label="Enrichment annotation"><USelectMenu :model-value="state.annotation || ALL" :items="annotationItems" value-key="value" class="w-full" @update:model-value="value => update({ annotation: value === ALL ? '' : value })" /></UFormField>
        <UFormField label="Enrichment tissue"><USelectMenu :model-value="state.tissue || ALL" :items="tissueItems" value-key="value" class="w-full" @update:model-value="value => update({ tissue: value === ALL ? '' : value })" /></UFormField>
        <UFormField label="Enrichment p-value (≤)"><UInput :model-value="state.pValue" placeholder="No maximum" class="w-full" @update:model-value="value => update({ pValue: String(value ?? '') })" /></UFormField>
        <UFormField label="Minimum fold (≥)"><UInput :model-value="state.minimumFold" placeholder="No minimum" class="w-full" @update:model-value="value => update({ minimumFold: String(value ?? '') })" /></UFormField>
      </div>
      <UButton color="neutral" variant="outline" @click="update({ annotation: '', tissue: '', pValue: '', minimumFold: '' })">Reset enrichment filters</UButton>
      <p v-if="filterError" role="status" class="text-error">{{ filterError }}</p>
      <template v-else>
        <div class="flex flex-wrap items-center justify-between gap-3"><p role="status" class="text-sm text-muted">{{ sorted.length }} matching rows from the shortlist. Select a column heading to sort.</p><UButton color="neutral" variant="outline" :disabled="!sorted.length" @click="download">Download enrichment CSV</UButton></div>
        <p v-if="downloadError" role="status" class="text-error">The CSV download could not be started.</p>
        <p v-if="!selection.scope.length" class="text-muted">No returned enrichment records match this ancestry selection.</p>
        <p v-else-if="!sorted.length" class="text-muted">No shortlisted enrichment records match these filters.</p>
        <template v-else>
          <GlobalEnrichmentsTable :rows="page.records" :sort="state.sort" :order="state.order" @sort="sort" />
          <p class="text-xs text-muted">Fold is SNPs divided by expected SNPs. Undefined ratios display as unavailable. CSV retains fractional SNP values, source enrichment, unrounded statistics and original identifiers. Tissue links open the legacy portal.</p>
          <nav class="flex flex-wrap items-center justify-between gap-3" aria-label="Global enrichment result pages"><p>Rows {{ page.start }}–{{ page.end }} · Page {{ page.page }} of {{ page.pages }}</p><div class="flex gap-2"><UButton color="neutral" variant="outline" :disabled="page.page === 1" @click="update({ page: page.page - 1 })">Previous enrichments</UButton><UButton color="neutral" variant="outline" :disabled="page.page === page.pages" @click="update({ page: page.page + 1 })">Next enrichments</UButton></div></nav>
        </template>
      </template>
    </template>
  </section>
</template>
