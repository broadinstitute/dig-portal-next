<script setup lang="ts">
import { createProvenanceClient } from '@dig-portal/api-clients'
import { ancestryLabel } from '@dig-portal/domain'
import { selectProvenanceAncestry } from '@dig-portal/feature-phenotype'

const props = defineProps<{ phenotype: string, ancestry: string }>()
const client = createProvenanceClient({ baseUrl: useRuntimeConfig().public.provenanceUrl })
const view = ref('graph')
const viewOpen = ref(false)
const copied = ref(false)
const copyError = ref(false)
const { data: traits, status: traitsStatus, error: traitsError, refresh: refreshTraits } = useLazyAsyncData(
  'bottom-line-traits',
  (_nuxtApp, { signal }) => client.traits({ signal }),
  { server: false, default: () => [] },
)
const selected = computed(() => selectProvenanceAncestry(traits.value, props.phenotype, props.ancestry))
const requestKey = computed(() => `bottom-line-provenance:${props.phenotype}:${props.ancestry}:${selected.value?.id ?? ''}`)
const { data: detail, status, error, refresh } = useLazyAsyncData(
  requestKey,
  async (_nuxtApp, { signal }) => {
    const artifact = selected.value
    if (!artifact) return null
    const result = await client.provenance(artifact.id, { signal })
    if (result.traitId !== props.phenotype || result.ancestryId !== (props.ancestry || 'Mixed')) {
      throw new Error('Provenance does not match the selected phenotype and ancestry.')
    }
    return result
  },
  { server: false },
)
const json = computed(() => JSON.stringify(detail.value?.raw ?? {}, null, 2))
const summaryUrl = computed(() => detail.value ? client.summaryStatisticsUrl(detail.value.traitId, detail.value.ancestryId) : null)
const legacyUrl = computed(() => `https://hugeamp.org/bottom-line.html?${new URLSearchParams({ trait: props.phenotype, ...(props.ancestry ? { ancestry: props.ancestry } : {}) })}`)
watch(requestKey, () => { view.value = 'graph'; viewOpen.value = false; copied.value = false; copyError.value = false })

function closeViewSelectorOnEscape(event: KeyboardEvent) {
  if (!viewOpen.value) return
  viewOpen.value = false
  event.stopPropagation()
}

async function copyJson() {
  copied.value = false
  copyError.value = false
  try {
    await navigator.clipboard.writeText(json.value)
    copied.value = true
  } catch {
    copyError.value = true
  }
}
</script>

<template>
  <div class="space-y-5">
    <p class="text-sm text-muted">
      {{ phenotype }} · {{ ancestryLabel(ancestry || 'Mixed') }}
    </p>
    <a :href="legacyUrl" class="text-primary underline">View full provenance page</a>
    <p v-if="traitsStatus === 'idle' || traitsStatus === 'pending'" role="status">Loading bottom-line traits…</p>
    <div v-else-if="traitsError" class="space-y-3">
      <UAlert color="error" title="Bottom-line traits could not be loaded" />
      <UButton color="neutral" variant="outline" @click="refreshTraits()">Try again</UButton>
    </div>
    <p v-else-if="!selected">No bottom-line provenance is available for this phenotype and ancestry.</p>
    <p v-else-if="status === 'idle' || status === 'pending'" role="status">Loading provenance…</p>
    <div v-else-if="error" class="space-y-3">
      <UAlert color="error" title="Provenance could not be loaded" />
      <UButton color="neutral" variant="outline" @click="refresh()">Try again</UButton>
    </div>
    <template v-else-if="detail">
      <p v-if="detail.description">{{ detail.description }}</p>
      <dl class="grid gap-3 text-sm sm:grid-cols-3">
        <div><dt class="font-medium">Pipeline</dt><dd>{{ detail.pipelineType }}</dd></div>
        <div><dt class="font-medium">Trait ID</dt><dd>{{ detail.traitId }}</dd></div>
        <div><dt class="font-medium">Ancestry</dt><dd>{{ ancestryLabel(detail.ancestryId) }}</dd></div>
      </dl>
      <div class="flex flex-wrap gap-4">
        <a :href="summaryUrl!" class="text-primary underline">Download summary statistics</a>
        <a :href="client.provenanceUrl(detail.id)" class="text-primary underline">Provenance data</a>
      </div>
      <div @keydown.esc.capture="closeViewSelectorOnEscape">
        <UFormField label="Provenance view">
          <USelect v-model="view" v-model:open="viewOpen" :items="[{ label: 'Graph', value: 'graph' }, { label: 'Table', value: 'table' }, { label: 'JSON', value: 'json' }]" :portal="false" />
        </UFormField>
      </div>
      <ProvenanceGraph v-if="view === 'graph'" :key="detail.id" :graph="detail.graph" />
      <ProvenanceTable v-else-if="view === 'table'" :key="detail.id" :graph="detail.graph" />
      <div v-else class="space-y-3">
        <UButton color="neutral" variant="outline" @click="copyJson">{{ copied ? 'Copied' : 'Copy JSON' }}</UButton>
        <p v-if="copyError" role="status">Copying is unavailable. Select and copy the JSON below.</p>
        <pre tabindex="0" aria-label="Provenance JSON" class="max-h-[36rem] overflow-auto rounded-lg bg-muted p-4 text-xs"><code>{{ json }}</code></pre>
      </div>
    </template>
  </div>
</template>
