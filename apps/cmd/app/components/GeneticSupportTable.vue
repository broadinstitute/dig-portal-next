<script setup lang="ts">
import { formatGeneSupport, geneSupportEvidence, type GeneSupportRow, type GeneSupportTab } from '@dig-portal/feature-phenotype'
defineProps<{ rows: readonly GeneSupportRow[], tab: GeneSupportTab }>()
defineEmits<{ geneSets: [gene: string] }>()
const geneUrl = (gene: string) => `https://hugeamp.org/gene.html?${new URLSearchParams({ gene })}`
const calculatorUrl = (row: GeneSupportRow) => `https://hugeamp.org/hugecalculator.html?${new URLSearchParams({ gene: row.gene, phenotype: row.phenotype, prior: '0.3696' })}`
</script>

<template>
  <div tabindex="0" role="region" aria-label="Gene support results" class="overflow-x-auto rounded-lg border border-default">
    <table class="w-full text-left text-sm">
      <caption class="sr-only">Genetic support for genes. Support scores are reported log Bayes factors. HuGE scores are raw, untransformed scores. Missing matches are not treated as zero.</caption>
      <thead class="bg-elevated">
        <tr>
          <th scope="col" class="p-3">Gene</th>
          <template v-if="tab !== 'huge'">
            <th scope="col" class="p-3 text-right">Combined support</th>
            <th v-if="tab !== 'comparison'" scope="col" class="p-3 text-right">Direct support</th>
            <th v-if="tab !== 'comparison'" scope="col" class="p-3 text-right">Indirect support</th>
            <th scope="col" class="p-3">Factor label</th>
          </template>
          <template v-if="tab === 'huge' || tab === 'comparison'">
            <th scope="col" class="p-3 text-right">{{ tab === 'comparison' ? 'Highest returned HuGE score' : 'HuGE score' }}</th>
            <th v-if="tab === 'huge'" scope="col" class="p-3 text-right">Common-variant BF</th>
            <th v-if="tab === 'huge'" scope="col" class="p-3 text-right">Rare-variant BF</th>
            <th scope="col" class="p-3">Reported HuGE locus</th>
          </template>
          <th v-if="tab === 'combined'" scope="col" class="p-3 text-right">FALCON PIP</th>
          <th scope="col" class="p-3">Evidence</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-default">
        <tr v-for="row in rows" :key="row.key" class="align-top">
          <th scope="row" class="p-3 font-medium"><a :href="geneUrl(row.gene)" class="text-primary underline">{{ row.gene }}</a></th>
          <template v-if="tab !== 'huge'">
            <td class="p-3 text-right tabular-nums" :title="geneSupportEvidence(row.combined)">{{ formatGeneSupport(row.combined) }}</td>
            <td v-if="tab !== 'comparison'" class="p-3 text-right tabular-nums" :title="geneSupportEvidence(row.direct)">{{ formatGeneSupport(row.direct) }}</td>
            <td v-if="tab !== 'comparison'" class="p-3 text-right tabular-nums" :title="geneSupportEvidence(row.indirect)">{{ formatGeneSupport(row.indirect) }}</td>
            <td class="min-w-48 p-3">{{ row.factorLabel ?? 'Not assigned' }}<p v-if="row.factor" class="text-xs text-muted">{{ row.factor }}</p></td>
          </template>
          <template v-if="tab === 'huge' || tab === 'comparison'">
            <td class="p-3 text-right tabular-nums">{{ formatGeneSupport(row.huge) }}</td>
            <td v-if="tab === 'huge'" class="p-3 text-right tabular-nums">{{ formatGeneSupport(row.common) }}</td>
            <td v-if="tab === 'huge'" class="p-3 text-right tabular-nums">{{ formatGeneSupport(row.rare) }}</td>
            <td class="whitespace-nowrap p-3"><template v-if="row.chromosome !== null">{{ row.chromosome }}:{{ row.start }}–{{ row.end }}</template><span v-else>Not returned</span><p v-if="tab === 'comparison' && row.hugeRecords > 1" class="text-xs text-muted">Highest score of {{ row.hugeRecords }} returned loci</p></td>
          </template>
          <td v-if="tab === 'combined'" class="p-3 text-right tabular-nums">{{ formatGeneSupport(row.pip) }}</td>
          <td class="p-3">
            <UButton v-if="tab !== 'huge'" color="neutral" variant="outline" @click="$emit('geneSets', row.gene)">View gene sets<span class="sr-only"> for {{ row.gene }}</span></UButton>
            <a v-else :href="calculatorUrl(row)" class="text-primary underline">HuGE calculator<span class="sr-only"> for {{ row.gene }}</span></a>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
