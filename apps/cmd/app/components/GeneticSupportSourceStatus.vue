<script setup lang="ts">
import type { BioIndexQueryResult } from '@dig-portal/api-clients'
defineProps<{ label: string, status: string, error?: unknown, result?: BioIndexQueryResult<unknown> | null }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="space-y-2">
    <p v-if="status === 'idle' || status === 'pending'" role="status" class="text-sm text-muted">Loading {{ label }}…</p>
    <div v-else-if="error" class="flex flex-wrap items-center gap-3">
      <p role="status" class="text-sm text-error">{{ label }} could not be loaded.</p>
      <UButton color="neutral" variant="outline" @click="$emit('retry')">Retry {{ label }}</UButton>
    </div>
    <template v-else-if="result">
      <p v-if="result.completeness === 'complete'" class="text-sm text-muted">{{ label }}: {{ result.data.length.toLocaleString() }} records returned.</p>
      <UAlert v-else color="warning" :title="`${label} results may be incomplete`" :description="`${result.data.length.toLocaleString()} records returned. Counts, plots, filters, and exports use only these records; additional results may exist.`" />
      <p v-if="result.restricted" class="text-sm text-muted">{{ label }}: {{ result.restricted.toLocaleString() }} restricted records reported.</p>
    </template>
  </div>
</template>
