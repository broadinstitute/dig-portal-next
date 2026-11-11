<script setup lang="ts">
import type { ProvenanceGraph } from '@dig-portal/domain'
import type { Network } from 'vis-network'

const props = defineProps<{ graph: ProvenanceGraph }>()
const container = useTemplateRef<HTMLDivElement>('container')
const loading = ref(true)
const failed = ref(false)
const selected = ref('')
let network: Network | undefined
let disposed = false

onMounted(async () => {
  try {
    // D-11/D-19: fetch the browser-only renderer only when this view mounts.
    const { Network } = await import('vis-network/standalone')
    if (disposed || !container.value) return
    const activities = new Set(props.graph.activities.map(({ id }) => id))
    const nodes = new Map([...props.graph.activities, ...props.graph.resources].map((node) => [node.id, {
      id: node.id,
      label: `${node.type}\n${node.name.length > 65 ? `${node.name.slice(0, 62)}…` : node.name}`,
      shape: activities.has(node.id) ? 'box' : 'ellipse',
      color: activities.has(node.id) ? { background: '#f0e9fc', border: '#694d9c' } : { background: '#e4f1ff', border: '#135b9c' },
    }]))
    const edges = [
      ...props.graph.used.map(({ subject, object }) => ({ from: object, to: subject })),
      ...props.graph.generated.map(({ subject, object }) => ({ from: object, to: subject })),
      ...props.graph.linked.map(({ subject, object }) => ({ from: subject, to: object })),
    ]
    for (const { from, to } of edges) {
      for (const id of [from, to]) {
        if (!nodes.has(id)) nodes.set(id, { id, label: id, shape: 'ellipse', color: { background: '#fef3c7', border: '#92400e' } })
      }
    }
    network = new Network(container.value, { nodes: [...nodes.values()], edges }, {
      physics: false,
      layout: { hierarchical: { enabled: true, direction: 'UD', sortMethod: 'directed', nodeSpacing: 240, levelSeparation: 160 } },
      nodes: { font: { color: '#172554', size: 14 }, margin: { top: 12, right: 12, bottom: 12, left: 12 }, widthConstraint: { maximum: 230 } },
      edges: { arrows: 'to', color: '#64748b', smooth: false },
      interaction: { dragNodes: false, zoomView: true, dragView: true },
    })
    network.on('selectNode', ({ nodes: ids }: { nodes: string[] }) => {
      const node = [...props.graph.activities, ...props.graph.resources].find(({ id }) => id === ids[0])
      selected.value = node ? `${node.type}: ${node.name}` : ''
    })
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
})
onBeforeUnmount(() => { disposed = true; network?.destroy(); network = undefined })

function zoom(factor: number) {
  if (network) network.moveTo({ scale: Math.max(0.02, Math.min(4, network.getScale() * factor)) })
}
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm text-muted">{{ graph.activities.length }} stages, {{ graph.resources.length }} resources. Data flows from top to bottom. Drag to pan and scroll to zoom. Table and JSON views provide text versions of the data.</p>
    <p v-if="loading" role="status">Loading provenance graph…</p>
    <UAlert v-if="failed" color="warning" title="The graph could not be displayed" description="Choose Table or JSON to inspect the provenance data." />
    <div v-show="!failed" class="space-y-3">
      <div class="flex gap-2" role="group" aria-label="Graph controls">
        <UButton color="neutral" variant="outline" :disabled="loading" @click="zoom(1 / 1.3)">Zoom out</UButton>
        <UButton color="neutral" variant="outline" :disabled="loading" @click="zoom(1.3)">Zoom in</UButton>
        <UButton color="neutral" variant="outline" :disabled="loading" @click="network?.fit()">Fit graph</UButton>
      </div>
      <div ref="container" role="img" aria-label="Processing stages and resources connected by data flow. Inspect stages in Table view or all data in JSON view." class="h-[32rem] rounded-lg border border-default bg-white" />
      <p v-if="selected" role="status" class="text-sm">{{ selected }}</p>
    </div>
  </div>
</template>
