<script setup lang="ts">
import { ancestryLabel, type Phenotype } from '@dig-portal/domain'
import { associationPage, pathwayAssociationsCsv, pathwayQueryKeys, pathwayTableQuery, readPathwayTableState, sortPathwayAssociations, type PathwayTableState } from '@dig-portal/feature-phenotype'

const props = defineProps<{ phenotype: Phenotype, ancestry: string }>()
const route = useRoute()
const router = useRouter()
const client = useBioIndex()
const state = computed(() => readPathwayTableState(route.query))
const key = computed(() => `pathway-associations:${JSON.stringify([props.phenotype.name, props.ancestry])}`)
const { data: result, status, error, refresh } = useLazyAsyncData(key,
  (_nuxtApp, { signal }) => client.pathwayAssociations(props.phenotype.name, props.ancestry, { signal }), { server: false })
const sorted = computed(() => sortPathwayAssociations(result.value?.data ?? [], state.value))
const page = computed(() => associationPage(sorted.value, state.value.page, 10))
const downloadError = ref(false)

function update(patch: Partial<PathwayTableState>) {
  const query = { ...route.query }
  for (const key of pathwayQueryKeys) delete query[key]
  Object.assign(query, pathwayTableQuery({ ...state.value, ...patch, page: patch.page ?? 1 }))
  router.replace({ query, hash: route.hash })
}
function sort(field: PathwayTableState['sort']) {
  update({ sort: field, order: state.value.sort === field && state.value.order === 'asc' ? 'desc' : 'asc' })
}
function download() {
  downloadError.value = false
  let url: string | undefined, anchor: HTMLAnchorElement | undefined
  try {
    url = URL.createObjectURL(new Blob([pathwayAssociationsCsv(sorted.value)], { type: 'text/csv;charset=utf-8' }))
    anchor = document.createElement('a'); anchor.href = url
    anchor.download = `${props.phenotype.name}-${props.ancestry || 'all'}-pathways.csv`.replace(/[^A-Za-z0-9._-]/g, '_')
    document.body.append(anchor); anchor.click()
  } catch { downloadError.value = true }
  finally { anchor?.remove(); if (url) { const downloadUrl = url; setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000) } }
}
</script>

<template>
  <section class="mt-10 space-y-4" aria-labelledby="pathways-heading">
    <h2 id="pathways-heading" class="text-xl font-semibold">Top pathways</h2>
    <p class="text-sm text-muted">{{ phenotype.description }} · {{ ancestry ? ancestryLabel(ancestry) : 'All ancestries' }}. Up to 100 pathway associations are requested. Sorting and CSV export use only the returned records.</p>
    <GeneticSupportSourceStatus label="Pathways" :status="status" :error="error" :result="result" @retry="refresh()" />
    <template v-if="status === 'success' && !error && result">
      <p v-if="!sorted.length" class="text-muted">No pathway associations were returned for this phenotype and ancestry.</p>
      <template v-else>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p role="status" class="text-sm text-muted">{{ sorted.length.toLocaleString() }} pathway associations returned. Select a column heading to sort.</p>
          <UButton color="neutral" variant="outline" @click="download">Download pathways CSV</UButton>
        </div>
        <p v-if="downloadError" role="status" class="text-error">The CSV download could not be started.</p>
        <PathwayAssociationsTable :rows="page.records" :sort="state.sort" :order="state.order" @sort="sort" />
        <p class="text-xs text-muted">Beta and standard error are shown as reported. CSV retains unrounded values and original pathway identifiers.</p>
        <nav class="flex flex-wrap items-center justify-between gap-3" aria-label="Pathway result pages">
          <p>Rows {{ page.start }}–{{ page.end }} · Page {{ page.page }} of {{ page.pages }}</p>
          <div class="flex gap-2">
            <UButton color="neutral" variant="outline" :disabled="page.page === 1" @click="update({ page: page.page - 1 })">Previous pathways</UButton>
            <UButton color="neutral" variant="outline" :disabled="page.page === page.pages" @click="update({ page: page.page + 1 })">Next pathways</UButton>
          </div>
        </nav>
      </template>
    </template>
  </section>
</template>
