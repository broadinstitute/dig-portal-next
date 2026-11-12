<script setup lang="ts">
import type { PigeanModel } from '@dig-portal/domain'
import { associationPage, formatGeneSupport } from '@dig-portal/feature-phenotype'
const props = defineProps<{ phenotype: string, gene: string, model: PigeanModel }>()
const client = useBioIndex()
const currentPage = ref(1)
const key = computed(() => `pigean-gene-sets:${JSON.stringify([props.phenotype, props.gene, props.model])}`)
const { data: result, status, error, refresh } = useLazyAsyncData(key,
  (_nuxtApp, { signal }) => client.pigeanGeneSets(props.phenotype, props.gene, props.model, { signal }), { server: false })
const sorted = computed(() => (result.value?.data ?? []).slice().sort((a, b) => b.jointEffect - a.jointEffect || a.geneSet.localeCompare(b.geneSet)))
const page = computed(() => associationPage(sorted.value, currentPage.value, 10))
watch(key, () => { currentPage.value = 1 })
</script>

<template>
  <section class="space-y-4 rounded-lg border border-default p-4" aria-label="Gene-set evidence">
    <h3 class="font-semibold">Gene-set evidence for {{ gene }}</h3>
    <GeneticSupportSourceStatus label="Gene-set evidence" :status="status" :error="error" :result="result" @retry="refresh()" />
    <template v-if="status === 'success' && !error">
      <p class="text-sm text-muted">Joint effects are reported in log-odds units. Only gene sets returned for this gene and model are shown.</p>
      <p v-if="!sorted.length" class="text-muted">No gene-set evidence was returned.</p>
      <div v-else tabindex="0" role="region" aria-label="Gene-set effects" class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead><tr><th scope="col" class="p-3">Gene set</th><th scope="col" class="p-3 text-right">Joint effect</th><th scope="col" class="p-3">Source</th></tr></thead>
          <tbody><tr v-for="row in page.records" :key="`${row.geneSet}:${row.source}`"><td class="p-3">{{ row.geneSet }}</td><td class="p-3 text-right tabular-nums">{{ formatGeneSupport(row.jointEffect) }}</td><td class="p-3">{{ row.source }}</td></tr></tbody>
        </table>
      </div>
      <nav v-if="page.pages > 1" class="flex flex-wrap items-center gap-3" aria-label="Gene-set evidence pages">
        <UButton color="neutral" variant="outline" :disabled="page.page === 1" @click="currentPage = page.page - 1">Previous</UButton>
        <span>Page {{ page.page }} of {{ page.pages }}</span>
        <UButton color="neutral" variant="outline" :disabled="page.page === page.pages" @click="currentPage = page.page + 1">Next</UButton>
      </nav>
    </template>
  </section>
</template>
