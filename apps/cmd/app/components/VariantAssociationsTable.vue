<script setup lang="ts">
import type { Phenotype, VariantAssociation } from '@dig-portal/domain'
import { associationMetaKey, associationMetaLabel, formatAssociationEffect, formatAssociationPValue, type AssociationTableState } from '@dig-portal/feature-phenotype'

const props = defineProps<{ records: readonly VariantAssociation[], phenotype: Phenotype, sort: AssociationTableState['sort'], order: AssociationTableState['order'] }>()
defineEmits<{ sort: [field: AssociationTableState['sort']] }>()

function ariaSort(field: AssociationTableState['sort']) {
  return props.sort !== field ? 'none' : props.order === 'asc' ? 'ascending' : 'descending'
}

function legacyLink(page: string, query: Record<string, string>) {
  return `https://hugeamp.org/${page}.html?${new URLSearchParams(query)}`
}

function regionLink(record: VariantAssociation) {
  return legacyLink('region', {
    phenotype: record.phenotype,
    chr: record.chromosome,
    start: String(Math.max(1, record.position - 50000)),
    end: String(Math.min(Number.MAX_SAFE_INTEGER, record.position + 50000)),
    ...(record.ancestry !== 'Mixed' ? { ancestry: record.ancestry } : {}),
  })
}
</script>

<template>
  <div tabindex="0" role="region" aria-label="Single-variant association results" class="overflow-x-auto rounded-lg border border-default">
    <table class="w-full text-left text-sm">
      <caption class="sr-only">Single-variant associations for {{ phenotype.description }}. Effects are for ALT relative to REF. Position, p-value, and effect headers change the sort order.</caption>
      <thead class="bg-elevated">
        <tr>
          <th scope="col" :aria-sort="ariaSort('position')" class="whitespace-nowrap p-3"><button type="button" class="cursor-pointer underline decoration-dotted underline-offset-4" @click="$emit('sort', 'position')">Position <span v-if="sort === 'position'" aria-hidden="true">{{ order === 'asc' ? '↑' : '↓' }}</span></button></th>
          <th scope="col" class="p-3">Alleles (REF → ALT)</th>
          <th scope="col" class="p-3">dbSNP</th>
          <th scope="col" class="p-3">Closest genes</th>
          <th scope="col" class="p-3">Consequence</th>
          <th scope="col" class="p-3">Meta-analysis</th>
          <th scope="col" :aria-sort="ariaSort('pValue')" class="whitespace-nowrap p-3 text-right"><button type="button" class="cursor-pointer underline decoration-dotted underline-offset-4" @click="$emit('sort', 'pValue')">P-value <span v-if="sort === 'pValue'" aria-hidden="true">{{ order === 'asc' ? '↑' : '↓' }}</span></button></th>
          <th scope="col" :aria-sort="ariaSort('effect')" class="whitespace-nowrap p-3 text-right"><button type="button" class="cursor-pointer underline decoration-dotted underline-offset-4" @click="$emit('sort', 'effect')">{{ phenotype.dichotomous ? 'Odds ratio' : 'Beta' }} <span v-if="sort === 'effect'" aria-hidden="true">{{ order === 'asc' ? '↑' : '↓' }}</span></button></th>
          <th scope="col" class="p-3">Dataset</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-default">
        <tr v-for="(record, index) in records" :key="`${record.variantId}:${record.dataset}:${record.source}:${index}`" class="align-top">
          <td class="whitespace-nowrap p-3 tabular-nums"><a :href="regionLink(record)" class="text-primary underline">{{ record.chromosome }}:{{ record.position.toLocaleString() }}</a></td>
          <td class="max-w-60 break-all p-3"><a :href="legacyLink('variant', { variant: record.variantId })" class="text-primary underline">{{ record.reference }} → {{ record.alternate }}</a></td>
          <td class="p-3"><a v-if="record.rsId" :href="legacyLink('variant', { variant: record.rsId })" class="text-primary underline">{{ record.rsId }}</a><span v-else class="text-muted">Not recorded</span></td>
          <td class="p-3"><ul v-if="record.nearestGenes.length" class="space-y-1"><li v-for="gene in record.nearestGenes" :key="gene"><a :href="legacyLink('gene', { gene })" class="text-primary underline">{{ gene }}</a></li></ul><span v-else class="text-muted">Not recorded</span></td>
          <td class="min-w-32 p-3">{{ record.consequence?.replaceAll('_', ' ') ?? 'Not recorded' }}</td>
          <td class="min-w-40 p-3">{{ associationMetaLabel(associationMetaKey(record.metaTypes)) }}</td>
          <td class="whitespace-nowrap p-3 text-right tabular-nums">{{ formatAssociationPValue(record.pValue) }}</td>
          <td class="whitespace-nowrap p-3 text-right tabular-nums"><span v-if="record.beta !== null" aria-hidden="true">{{ record.beta > 0 ? '↑' : record.beta < 0 ? '↓' : '' }} </span>{{ formatAssociationEffect(record.beta, phenotype.dichotomous) }}</td>
          <td class="min-w-48 break-words p-3"><p>{{ record.dataset }}</p><p class="mt-1 text-xs text-muted">{{ record.source }}</p></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
