<script setup lang="ts">
import type { ProvenanceGraph } from '@dig-portal/domain'
import { provenanceHttpUrl, provenanceStages } from '@dig-portal/feature-phenotype'

const props = defineProps<{ graph: ProvenanceGraph }>()
const rows = computed(() => provenanceStages(props.graph))
const expanded = ref(false)
const highlighted = ref<string | null>(null)
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted">{{ rows.length }} stages, {{ graph.used.length }} inputs, {{ graph.generated.length }} outputs</p>
      <UButton color="neutral" variant="outline" @click="expanded = !expanded">{{ expanded ? 'Collapse all' : 'Expand all' }}</UButton>
    </div>
    <p class="text-sm text-muted">Stages in the same sequence have no recorded dependency on one another. Focus or hover over a resource to find it in other stages.</p>
    <p v-if="rows.some(({ sequence }) => sequence === null)" role="status">Some stage dependencies form a cycle; their sequence is unresolved.</p>
    <p v-if="!rows.length" class="text-muted">No processing stages were recorded.</p>
    <div v-else tabindex="0" role="region" aria-label="Provenance stages" class="overflow-x-auto rounded-lg border border-default">
      <table class="w-full text-left text-sm">
        <caption class="sr-only">Bottom-line processing stages and the resources each stage uses and produces</caption>
        <thead class="bg-elevated">
          <tr>
            <th scope="col" class="p-3">Sequence</th>
            <th scope="col" class="p-3">Stage</th>
            <th scope="col" class="p-3">Inputs</th>
            <th scope="col" class="p-3">Outputs</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr v-for="row in rows" :key="row.activity.id" class="align-top">
            <td class="p-3 tabular-nums">{{ row.sequence ?? 'Unresolved' }}</td>
            <th scope="row" class="min-w-56 p-3 font-normal">
              <p class="font-medium">{{ row.activity.type.replace(/Stage$/, '').replace(/([a-z])([A-Z])/g, '$1 $2') }}</p>
              <details :open="expanded" class="mt-2">
                <summary class="cursor-pointer">{{ row.activity.name }}</summary>
                <a v-if="provenanceHttpUrl(row.activity.location)" :href="provenanceHttpUrl(row.activity.location)!" class="mt-2 block break-all text-primary underline">Stage source</a>
                <p v-else-if="row.activity.location" class="mt-2 break-all text-xs text-muted">{{ row.activity.location }}</p>
              </details>
            </th>
            <td v-for="(resources, column) in [row.inputs, row.outputs]" :key="column" class="min-w-64 p-3">
              <p v-if="!resources.length" class="text-muted">No recorded {{ column === 0 ? 'inputs' : 'outputs' }}</p>
              <ul v-else class="space-y-3">
                <li v-for="(resource, index) in resources" :key="`${resource.id}:${index}`" :class="{ 'rounded bg-accented': highlighted === resource.id }" @mouseenter="highlighted = resource.id" @mouseleave="highlighted = null" @focusin="highlighted = resource.id" @focusout="highlighted = null">
                  <details :open="expanded">
                    <summary class="cursor-pointer"><span class="text-xs text-muted">{{ resource.type }} · </span>{{ resource.name }}</summary>
                    <template v-if="resource.location">
                      <a v-if="provenanceHttpUrl(resource.location)" :href="provenanceHttpUrl(resource.location)!" class="mt-2 block break-all text-primary underline">{{ resource.location }}</a>
                      <p v-else class="mt-2 break-all text-xs">{{ resource.location }}</p>
                    </template>
                    <p v-else class="mt-2 text-xs text-muted">No resource location recorded.</p>
                  </details>
                </li>
              </ul>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
