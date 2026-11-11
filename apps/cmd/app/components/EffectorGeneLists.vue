<script setup lang="ts">
import { effectorListsForPhenotype } from '@dig-portal/feature-phenotype'

const props = defineProps<{ phenotype: string }>()

const { data: catalog, status, error, refresh } = useLazyAsyncData(
  'effector-gene-catalog',
  async () => {
    const result = await queryCollection('effectorLists').first()
    if (!result) throw new Error('The effector-gene catalog is missing.')
    return result
  },
  { server: false },
)
const lists = computed(() => effectorListsForPhenotype(catalog.value?.entries ?? [], props.phenotype))
</script>

<template>
  <section class="mt-10 space-y-4" aria-labelledby="effector-gene-lists-heading">
    <h2 id="effector-gene-lists-heading" class="text-xl font-semibold">Predicted effector-gene lists</h2>
    <p v-if="status === 'idle' || status === 'pending'" class="text-muted">
      Loading effector-gene lists…
    </p>
    <div v-else-if="error" class="space-y-3">
      <UAlert
        color="error"
        title="Effector-gene lists could not be loaded"
        description="Try again to load the catalog."
      />
      <UButton color="neutral" variant="outline" @click="refresh()">Try again</UButton>
    </div>
    <p v-else-if="lists.length === 0" class="text-muted">
      No predicted effector-gene lists are available for this phenotype.
    </p>
    <ul v-else class="space-y-4">
      <li v-for="(entry, index) in lists" :key="`${entry.name}-${index}`">
        <UCard>
          <div class="space-y-2">
            <h3 class="font-semibold">{{ entry.name }}</h3>
            <p>{{ entry.title }}</p>
            <p class="text-sm text-muted">{{ entry.citation }}</p>
            <div class="flex flex-wrap gap-4 text-sm">
              <a
                v-if="entry.pageId"
                :href="`https://hugeamp.org/research.html?pageid=${encodeURIComponent(entry.pageId)}`"
                class="text-primary underline"
              >
                View genes<span class="sr-only"> for {{ entry.name }}</span>
              </a>
              <span v-else class="text-muted">Gene list unavailable</span>
              <a
                v-if="entry.pmid"
                :href="`https://pubmed.ncbi.nlm.nih.gov/${entry.pmid}/`"
                class="text-primary underline"
              >
                PubMed<span class="sr-only"> reference for {{ entry.name }}</span>
              </a>
            </div>
          </div>
        </UCard>
      </li>
    </ul>
  </section>
</template>
