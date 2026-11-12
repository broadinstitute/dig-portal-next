<script setup lang="ts">
import type { GeneticCorrelation, Phenotype } from '@dig-portal/domain'
import { correlationPhenotypeLabel, formatAssociationEffect, formatAssociationPValue, type CorrelationTableState } from '@dig-portal/feature-phenotype'

const props = defineProps<{ rows: readonly GeneticCorrelation[], phenotypes: readonly Phenotype[], ancestry: string, sort: CorrelationTableState['sort'], order: CorrelationTableState['order'] }>()
defineEmits<{ sort: [field: CorrelationTableState['sort']] }>()
const columns = [
  { field: 'otherPhenotype', label: 'Phenotype' }, { field: 'pValue', label: 'P-value' },
  { field: 'correlation', label: 'Correlation' }, { field: 'standardError', label: 'Standard error' },
] as const
const ariaSort = (field: CorrelationTableState['sort']) => props.sort !== field ? 'none' : props.order === 'asc' ? 'ascending' : 'descending'
const phenotypeLink = (id: string) => `/phenotype?${new URLSearchParams({ phenotype: id, ...(props.ancestry ? { ancestry: props.ancestry } : {}) })}`
</script>

<template>
  <div tabindex="0" role="region" aria-label="Genetic correlation results" class="overflow-x-auto rounded-lg border border-default">
    <table class="w-full text-left text-sm">
      <caption class="sr-only">Genetic correlations. Column headers change the sort order. Estimates and standard errors are shown as reported.</caption>
      <thead class="bg-elevated">
        <tr><th v-for="column in columns" :key="column.field" scope="col" :aria-sort="ariaSort(column.field)" class="whitespace-nowrap p-3" :class="column.field !== 'otherPhenotype' ? 'text-right' : ''">
          <button type="button" class="cursor-pointer underline decoration-dotted underline-offset-4" @click="$emit('sort', column.field)">
            {{ column.label }} <span v-if="sort === column.field" aria-hidden="true">{{ order === 'asc' ? '↑' : '↓' }}</span>
          </button>
        </th></tr>
      </thead>
      <tbody class="divide-y divide-default">
        <tr v-for="(row, index) in rows" :key="`${row.otherPhenotype}:${row.project}:${row.ancestry}:${index}`">
          <th scope="row" class="min-w-64 p-3 font-normal"><NuxtLink :to="phenotypeLink(row.otherPhenotype)" class="text-primary underline">{{ correlationPhenotypeLabel(row.otherPhenotype, phenotypes) }}</NuxtLink></th>
          <td class="p-3 text-right tabular-nums">{{ formatAssociationPValue(row.pValue) }}</td>
          <td class="p-3 text-right tabular-nums">{{ formatAssociationEffect(row.correlation, false) }}</td>
          <td class="p-3 text-right tabular-nums">{{ formatAssociationEffect(row.standardError, false) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
