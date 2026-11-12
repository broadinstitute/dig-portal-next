<script setup lang="ts">
import { ancestryLabel, type GlobalEnrichment } from '@dig-portal/domain'
import { enrichmentLabel, formatAssociationEffect, formatAssociationPValue, type EnrichmentTableState } from '@dig-portal/feature-phenotype'
const props = defineProps<{ rows: readonly GlobalEnrichment[], sort: EnrichmentTableState['sort'], order: EnrichmentTableState['order'] }>()
defineEmits<{ sort: [field: EnrichmentTableState['sort']] }>()
const columns = [{ field: 'tissue', label: 'Tissue' }, { field: 'annotation', label: 'Annotation' }, { field: 'ancestry', label: 'Ancestry' }, { field: 'pValue', label: 'P-value' }, { field: 'fold', label: 'Fold' }] as const
const ariaSort = (field: EnrichmentTableState['sort']) => props.sort !== field ? 'none' : props.order === 'asc' ? 'ascending' : 'descending'
const tissueLink = (tissue: string) => `https://hugeamp.org/tissue.html?${new URLSearchParams({ tissue })}`
</script>

<template>
  <div tabindex="0" role="region" aria-label="Globally enriched annotation results" class="overflow-x-auto rounded-lg border border-default">
    <table class="w-full text-left text-sm">
      <caption class="sr-only">Globally enriched annotations. Column headers change the sort order. Fold is observed SNPs divided by expected SNPs; an undefined ratio is unavailable.</caption>
      <thead class="bg-elevated"><tr><th v-for="column in columns" :key="column.field" scope="col" :aria-sort="ariaSort(column.field)" class="whitespace-nowrap p-3" :class="column.field === 'pValue' || column.field === 'fold' ? 'text-right' : ''"><button type="button" class="cursor-pointer underline decoration-dotted underline-offset-4" @click="$emit('sort', column.field)">{{ column.label }} <span v-if="sort === column.field" aria-hidden="true">{{ order === 'asc' ? '↑' : '↓' }}</span></button></th></tr></thead>
      <tbody class="divide-y divide-default"><tr v-for="(row, index) in rows" :key="`${row.tissue}:${row.annotation}:${row.ancestry}:${row.method}:${index}`">
        <th scope="row" class="min-w-40 p-3 font-normal"><a v-if="row.tissue !== null" :href="tissueLink(row.tissue)" class="text-primary underline">{{ enrichmentLabel(row.tissue) }}</a><span v-else>Not recorded</span></th>
        <td class="min-w-40 p-3">{{ enrichmentLabel(row.annotation) }}</td><td class="p-3">{{ ancestryLabel(row.ancestry) }}</td>
        <td class="p-3 text-right tabular-nums">{{ formatAssociationPValue(row.pValue) }}</td><td class="p-3 text-right tabular-nums">{{ formatAssociationEffect(row.fold, false) }}</td>
      </tr></tbody>
    </table>
  </div>
</template>
