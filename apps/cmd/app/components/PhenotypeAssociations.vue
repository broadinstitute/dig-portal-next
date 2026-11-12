<script setup lang="ts">
import { ancestryLabel, type Phenotype } from '@dig-portal/domain'
import { associationMetaSummary, associationPage, associationPValueError, associationQueryKeys, associationTableQuery, filterVariantAssociations, readAssociationTableState, sortVariantAssociations, variantAssociationsCsv, type AssociationTableState } from '@dig-portal/feature-phenotype'

const props = defineProps<{ phenotype: Phenotype, ancestry: string }>()
const ALL = '__all__'
const LIMIT = 1000
const route = useRoute()
const router = useRouter()
const client = useBioIndex()
const key = computed(() => `variant-associations:${JSON.stringify([props.phenotype.name, props.ancestry])}`)
const { data: result, status, error, refresh } = useLazyAsyncData(
  key,
  (_nuxtApp, { signal }) => client.variantAssociations(props.phenotype.name, props.ancestry, { limit: LIMIT, signal }),
  { server: false },
)
const state = computed(() => readAssociationTableState(route.query))
const records = computed(() => result.value?.data ?? [])
const thresholdError = computed(() => associationPValueError(state.value.pValue))
const filtered = computed(() => thresholdError.value ? [] : filterVariantAssociations(records.value, state.value))
const sorted = computed(() => sortVariantAssociations(filtered.value, state.value))
const page = computed(() => associationPage(sorted.value, state.value.page, state.value.pageSize))
const summary = computed(() => associationMetaSummary(filtered.value))
const geneItems = computed(() => {
  const genes = new Set(records.value.flatMap(({ nearestGenes }) => nearestGenes))
  if (state.value.gene) genes.add(state.value.gene)
  return [{ value: ALL, label: 'All closest genes' }, ...[...genes].sort().map((gene) => ({ value: gene, label: gene }))]
})
const metaItems = computed(() => {
  const combinations = associationMetaSummary(records.value)
  if (state.value.meta && !combinations.some(({ key }) => key === state.value.meta)) {
    combinations.push({ key: state.value.meta, label: state.value.meta, count: 0 })
  }
  return [{ value: ALL, label: 'All combinations' }, ...combinations.filter(({ key }) => key !== '').map(({ key, label }) => ({ value: key, label }))]
})
const downloadError = ref(false)

function update(patch: Partial<AssociationTableState>) {
  const next = { ...state.value, ...patch, page: patch.page ?? 1 }
  const query = { ...route.query }
  for (const key of associationQueryKeys) delete query[key]
  Object.assign(query, associationTableQuery(next))
  router.replace({ query, hash: route.hash })
}

function changeSort(sort: AssociationTableState['sort']) {
  update({ sort, order: state.value.sort === sort && state.value.order === 'asc' ? 'desc' : 'asc' })
}

function resetFilters() {
  update({ gene: '', pValue: '', effect: 'all', meta: '' })
}

function download() {
  downloadError.value = false
  let url: string | undefined
  try {
    // Event-only browser access keeps the component safe to prerender (D-11).
    url = URL.createObjectURL(new Blob([variantAssociationsCsv(sorted.value)], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${props.phenotype.name}-${props.ancestry || 'all'}-associations.csv`.replace(/[^A-Za-z0-9._-]/g, '_')
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
  } catch {
    downloadError.value = true
  } finally {
    if (url) {
      const downloadUrl = url
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
    }
  }
}
</script>

<template>
  <section class="mt-10 space-y-5" aria-labelledby="variant-associations-heading">
    <div class="space-y-1">
      <h2 id="variant-associations-heading" class="text-xl font-semibold">Top single-variant association signals</h2>
      <p class="text-sm text-muted">{{ phenotype.description }} · {{ ancestry ? ancestryLabel(ancestry) : 'All ancestries' }}</p>
    </div>
    <p v-if="status === 'idle' || status === 'pending'" role="status" class="text-muted">Loading single-variant associations…</p>
    <div v-else-if="error" class="space-y-3">
      <UAlert color="error" title="Single-variant associations could not be loaded" description="Try again to request results from BioIndex." />
      <UButton color="neutral" variant="outline" @click="refresh()">Try again</UButton>
    </div>
    <template v-else-if="result">
      <UAlert v-if="result.completeness !== 'complete'" color="warning" title="These results may be incomplete" :description="`BioIndex returned ${records.length.toLocaleString()} visible records with a request limit of ${LIMIT.toLocaleString()}. Filters, counts, and exports apply to these returned records; more results may exist.`" />
      <p v-if="result.restricted" class="text-sm text-muted">{{ result.restricted.toLocaleString() }} restricted records were reported by BioIndex.</p>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <UFormField label="Closest gene">
          <USelectMenu :model-value="state.gene || ALL" :items="geneItems" value-key="value" :filter-fields="['label']" virtualize class="w-full" @update:model-value="(value) => update({ gene: value === ALL ? '' : value })" />
        </UFormField>
        <UFormField label="Maximum p-value (≤)" :error="thresholdError ?? undefined">
          <UInput :model-value="state.pValue" placeholder="1 (no additional filter)" class="w-full" @update:model-value="(value) => update({ pValue: String(value ?? '') })" />
        </UFormField>
        <UFormField label="Effect direction">
          <USelect :model-value="state.effect" :items="[{ value: 'all', label: 'Any direction' }, { value: 'positive', label: 'Positive beta' }, { value: 'negative', label: 'Negative beta' }]" class="w-full" @update:model-value="(value) => update({ effect: value === 'positive' || value === 'negative' ? value : 'all' })" />
        </UFormField>
        <UFormField label="Meta-analysis combination">
          <USelect :model-value="state.meta || ALL" :items="metaItems" value-key="value" class="w-full" @update:model-value="(value) => update({ meta: value === ALL ? '' : value })" />
        </UFormField>
      </div>
      <div class="flex flex-wrap items-end gap-3">
        <UFormField label="Sort by"><USelect :model-value="state.sort" :items="[{ value: 'pValue', label: 'P-value' }, { value: 'position', label: 'Position' }, { value: 'effect', label: phenotype.dichotomous ? 'Odds ratio' : 'Beta' }]" @update:model-value="(value) => update({ sort: value === 'position' || value === 'effect' ? value : 'pValue' })" /></UFormField>
        <UFormField label="Order"><USelect :model-value="state.order" :items="[{ value: 'asc', label: 'Ascending' }, { value: 'desc', label: 'Descending' }]" @update:model-value="(value) => update({ order: value === 'desc' ? value : 'asc' })" /></UFormField>
        <UFormField label="Rows per page"><USelect :model-value="state.pageSize" :items="[10, 25, 50]" @update:model-value="(value) => update({ pageSize: value === 25 || value === 50 ? value : 10 })" /></UFormField>
        <UButton color="neutral" variant="outline" @click="resetFilters">Reset filters</UButton>
      </div>
      <p v-if="thresholdError" role="status" class="text-error">Correct the p-value filter to view or export results.</p>
      <template v-else>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p role="status" class="text-sm text-muted">{{ filtered.length.toLocaleString() }} matching records of {{ records.length.toLocaleString() }} returned.</p>
          <UButton color="neutral" variant="outline" :disabled="sorted.length === 0" @click="download">Download filtered CSV</UButton>
        </div>
        <p v-if="downloadError" role="status" class="text-error">The CSV download could not be started. Try again.</p>
        <p v-if="records.length === 0" class="text-muted">No visible association signals were returned for this phenotype and ancestry.</p>
        <p v-else-if="filtered.length === 0" class="text-muted">No association signals match these filters.</p>
        <template v-else>
          <div class="space-y-3 rounded-lg border border-default p-4">
            <h3 class="font-medium">Meta-analysis combinations in filtered results</h3>
            <ul class="space-y-3">
              <li v-for="item in summary" :key="item.key" class="space-y-1">
                <div class="flex justify-between gap-4 text-sm"><span>{{ item.label }}</span><span class="tabular-nums">{{ item.count.toLocaleString() }}</span></div>
                <div aria-hidden="true" class="h-2 rounded bg-elevated"><div class="h-2 rounded bg-primary" :style="{ width: `${item.count / filtered.length * 100}%` }" /></div>
              </li>
            </ul>
          </div>
          <VariantAssociationsTable :records="page.records" :phenotype="phenotype" :sort="state.sort" :order="state.order" @sort="changeSort" />
          <p class="text-xs text-muted">Effects are for ALT relative to REF. {{ phenotype.dichotomous ? 'Odds ratios are calculated as exp(beta).' : 'Beta values are shown as reported.' }} CSV exports retain unrounded p-values and beta values. Gene, variant, and region links open the legacy portal.</p>
          <nav class="flex flex-wrap items-center justify-between gap-3" aria-label="Association result pages">
            <p role="status" class="text-sm text-muted">Rows {{ page.start }}–{{ page.end }} · Page {{ page.page }} of {{ page.pages }}</p>
            <div class="flex gap-2">
              <UButton color="neutral" variant="outline" :disabled="page.page === 1" @click="update({ page: page.page - 1 })">Previous</UButton>
              <UButton color="neutral" variant="outline" :disabled="page.page === page.pages" @click="update({ page: page.page + 1 })">Next</UButton>
            </div>
          </nav>
        </template>
      </template>
    </template>
  </section>
</template>
