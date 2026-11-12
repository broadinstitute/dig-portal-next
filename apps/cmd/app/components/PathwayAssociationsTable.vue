<script setup lang="ts">
import type { PathwayAssociation } from '@dig-portal/domain'
import { formatAssociationEffect, formatAssociationPValue, type PathwayTableState } from '@dig-portal/feature-phenotype'

const props = defineProps<{ rows: readonly PathwayAssociation[], sort: PathwayTableState['sort'], order: PathwayTableState['order'] }>()
defineEmits<{ sort: [field: PathwayTableState['sort']] }>()
const columns = [
  { field: 'pathwayName', label: 'Pathway' }, { field: 'pValue', label: 'P-value' },
  { field: 'beta', label: 'Beta' }, { field: 'standardError', label: 'Standard error' },
] as const
const ariaSort = (field: PathwayTableState['sort']) => props.sort !== field ? 'none' : props.order === 'asc' ? 'ascending' : 'descending'
</script>

<template>
  <div tabindex="0" role="region" aria-label="Pathway association results" class="overflow-x-auto rounded-lg border border-default">
    <table class="w-full text-left text-sm">
      <caption class="sr-only">Pathway associations. Column headers change the sort order. Beta and standard error are shown as reported.</caption>
      <thead class="bg-elevated">
        <tr><th v-for="column in columns" :key="column.field" scope="col" :aria-sort="ariaSort(column.field)" class="whitespace-nowrap p-3" :class="column.field !== 'pathwayName' ? 'text-right' : ''">
          <button type="button" class="cursor-pointer underline decoration-dotted underline-offset-4" @click="$emit('sort', column.field)">
            {{ column.label }} <span v-if="sort === column.field" aria-hidden="true">{{ order === 'asc' ? '↑' : '↓' }}</span>
          </button>
        </th></tr>
      </thead>
      <tbody class="divide-y divide-default">
        <tr v-for="(row, index) in rows" :key="`${row.pathwayName}:${row.ancestry}:${index}`">
          <th scope="row" class="min-w-64 max-w-xl break-words p-3 font-normal">{{ row.pathwayName }}</th>
          <td class="p-3 text-right tabular-nums">{{ formatAssociationPValue(row.pValue) }}</td>
          <td class="p-3 text-right tabular-nums">{{ formatAssociationEffect(row.beta, false) }}</td>
          <td class="p-3 text-right tabular-nums">{{ formatAssociationEffect(row.standardError, false) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
