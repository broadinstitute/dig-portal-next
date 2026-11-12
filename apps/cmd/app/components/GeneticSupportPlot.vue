<script setup lang="ts">
import { geneSupportPlotPoints, type GeneSupportRow, type GeneSupportTab } from '@dig-portal/feature-phenotype'
const props = defineProps<{ rows: readonly GeneSupportRow[], tab: GeneSupportTab }>()
const id = useId()
const points = computed(() => geneSupportPlotPoints(props.rows, props.tab))
const series = computed(() => [...new Set(points.value.map(({ series }) => series))])
const scatter = computed(() => props.tab === 'direct-indirect')
const yLabel = computed(() => props.tab === 'huge' ? 'ln(HuGE score)' : scatter.value ? 'Indirect support' : props.tab === 'comparison' ? 'Reported support / ln(HuGE)' : 'Reported log Bayes factor')
const xLabel = computed(() => scatter.value ? 'Direct support' : 'Row rank in the current sort order')
const colours = ['#1d4ed8', '#a21caf', '#047857']
const axes = computed(() => {
  const xs = [0, ...points.value.map(({ x }) => x), ...(scatter.value ? [1] : [])]
  const ys = [0, ...points.value.map(({ y }) => y), ...(scatter.value ? [1] : [])]
  const bounds = (values: number[]) => {
    const min = Math.min(...values), max = Math.max(...values)
    return { min, max: min === max ? max + 1 : max }
  }
  return { x: bounds(xs), y: bounds(ys) }
})
function coordinate(value: number, axis: 'x' | 'y') {
  const { min, max } = axes.value[axis]
  const scale = Math.max(Math.abs(min), Math.abs(max), 1)
  const fraction = (value / scale - min / scale) / (max / scale - min / scale)
  return axis === 'x' ? 80 + fraction * 840 : 300 - fraction * 270
}
function tick(axis: 'x' | 'y', fraction: number) {
  const { min, max } = axes.value[axis]
  return (1 - fraction) * min + fraction * max
}
</script>

<template>
  <figure class="space-y-3">
    <figcaption class="text-sm text-muted">{{ points.length.toLocaleString() }} plotted values. Exact values and gene links are available in the table. Nonpositive HuGE scores remain in the table but cannot appear on a logarithmic axis.</figcaption>
    <p v-if="!points.length" class="text-muted">No plottable values were returned.</p>
    <template v-else>
      <ul class="flex flex-wrap gap-4 text-sm" aria-label="Plot series">
        <li v-for="(name, index) in series" :key="name"><span :style="{ color: colours[index % colours.length] }" aria-hidden="true">{{ index === 0 ? '●' : index === 1 ? '■' : '▲' }}</span> {{ name }}</li>
      </ul>
      <div tabindex="0" role="region" aria-label="Genetic support plot" class="overflow-x-auto rounded-lg border border-default bg-white">
        <svg viewBox="0 0 960 370" class="min-w-[40rem] w-full text-slate-900" role="img" :aria-labelledby="`${id}-title ${id}-description`">
          <title :id="`${id}-title`">{{ xLabel }} versus {{ yLabel }}</title>
          <desc :id="`${id}-description`">{{ points.length }} values. Inspect the table below for the text equivalent. Dashed reference lines in the direct versus indirect view mark a score of one.</desc>
          <g v-for="fraction in [0, 0.25, 0.5, 0.75, 1]" :key="fraction" fill="currentColor" font-size="11">
            <line x1="80" x2="920" :y1="coordinate(tick('y', fraction), 'y')" :y2="coordinate(tick('y', fraction), 'y')" stroke="#e2e8f0" />
            <text x="70" :y="coordinate(tick('y', fraction), 'y') + 4" text-anchor="end">{{ Number(tick('y', fraction).toPrecision(3)) }}</text>
            <text :x="coordinate(tick('x', fraction), 'x')" y="320" text-anchor="middle">{{ Number(tick('x', fraction).toPrecision(3)) }}</text>
          </g>
          <path d="M80 30 V300 H920" fill="none" stroke="#334155" />
          <g v-if="scatter" stroke="#475569" stroke-dasharray="5 4">
            <line :x1="coordinate(1, 'x')" :x2="coordinate(1, 'x')" y1="30" y2="300" />
            <line x1="80" x2="920" :y1="coordinate(1, 'y')" :y2="coordinate(1, 'y')" />
          </g>
          <g v-for="(point, index) in points" :key="index" :transform="`translate(${coordinate(point.x, 'x')},${coordinate(point.y, 'y')})`" :fill="colours[series.indexOf(point.series) % colours.length]" fill-opacity="0.65">
            <title>{{ point.gene }} · {{ point.series }} · x={{ point.x }}, y={{ point.y }}</title>
            <circle v-if="series.indexOf(point.series) === 0" r="3" />
            <rect v-else-if="series.indexOf(point.series) === 1" x="-3" y="-3" width="6" height="6" />
            <path v-else d="M0 -4 L4 3 L-4 3 Z" />
          </g>
          <text x="500" y="352" text-anchor="middle" fill="currentColor" font-size="13">{{ xLabel }}</text>
          <text transform="translate(20,165) rotate(-90)" text-anchor="middle" fill="currentColor" font-size="13">{{ yLabel }}</text>
        </svg>
      </div>
    </template>
  </figure>
</template>
