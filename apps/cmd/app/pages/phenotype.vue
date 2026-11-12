<script setup lang="ts">
import { ancestryLabel } from '@dig-portal/domain'
import { ancestryOptions, datasetsForPhenotype, findPhenotype, phenotypeRouteQuery, readPhenotypeRouteState } from '@dig-portal/feature-phenotype'
import portal from '../../portal.config'

const ALL_ANCESTRIES = '__all__'

const route = useRoute()
const router = useRouter()
const bioIndex = useBioIndex()

const state = computed(() => readPhenotypeRouteState(route.query))

const { data: phenotypes, status: phenotypesStatus, error: phenotypesError } = useLazyAsyncData(
  `phenotypes:${portal.registryGroup}`,
  (_nuxtApp, { signal }) => bioIndex.phenotypes(portal.registryGroup, { signal }),
  { server: false, default: () => [] },
)
const { data: datasets, status: datasetsStatus, error: datasetsError } = useLazyAsyncData(
  `datasets:${portal.registryGroup}`,
  (_nuxtApp, { signal }) => bioIndex.datasets(portal.registryGroup, { signal }),
  { server: false, default: () => [] },
)

const phenotype = computed(() => findPhenotype(phenotypes.value, state.value.phenotype))
const phenotypeItems = computed(() => phenotypes.value
  .map(({ name, description }) => ({ value: name, label: description.trim() }))
  .sort((a, b) => a.label.localeCompare(b.label)))
const ancestries = computed(() => ancestryOptions(datasets.value))
const ancestryItems = computed(() => [{ value: ALL_ANCESTRIES, label: 'All ancestries' }, ...ancestries.value])
const associatedDatasets = computed(() =>
  datasetsForPhenotype(datasets.value, phenotype.value?.name ?? null, state.value.ancestry))
const unknownAncestry = computed(() => datasetsStatus.value === 'success'
  && state.value.ancestry !== ''
  && !ancestries.value.some(({ value }) => value === state.value.ancestry))

const selectedPhenotype = computed({
  get: () => state.value.phenotype ?? undefined,
  set: (name) => {
    if (name) router.push({ query: phenotypeRouteQuery({ ...state.value, phenotype: name }) })
  },
})
const selectedAncestry = computed({
  get: () => state.value.ancestry || ALL_ANCESTRIES,
  set: (code) => {
    const ancestry = code === ALL_ANCESTRIES ? '' : code
    router.replace({ query: phenotypeRouteQuery({ ...state.value, ancestry }) })
  },
})

const plots = computed(() => {
  if (!phenotype.value || unknownAncestry.value) return []
  const ancestry = state.value.ancestry || undefined
  return [
    { kind: 'manhattan' as const, title: 'Manhattan plot' },
    { kind: 'qq' as const, title: 'QQ plot' },
  ].map(({ kind, title }) => ({ title, url: bioIndex.phenotypePlotUrl(phenotype.value!.name, kind, ancestry) }))
})
const failedPlots = ref(new Set<string>())
const provenanceOpen = ref(false)
const legacyPhenotypeLink = (name: string) => `https://hugeamp.org/phenotype.html?${new URLSearchParams({ phenotype: name })}`
watch(() => [state.value.phenotype, state.value.ancestry], () => { provenanceOpen.value = false })

useHead(() => ({
  title: phenotype.value ? `${phenotype.value.description} | ${portal.title}` : `Phenotype | ${portal.title}`,
}))
</script>

<template>
  <div class="space-y-8">
    <div class="space-y-2">
      <p class="text-sm font-medium text-muted">Phenotype</p>
      <h1 class="text-3xl font-semibold">
        <ClientOnly fallback="Phenotype">
          {{ phenotype?.description ?? 'Phenotype' }}
        </ClientOnly>
      </h1>
    </div>

    <ClientOnly>
      <template #fallback>
        <p class="text-muted">Loading phenotype data…</p>
      </template>

      <div class="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <UFormField label="Phenotype">
          <USelectMenu
            v-model="selectedPhenotype"
            :items="phenotypeItems"
            value-key="value"
            :filter-fields="['label', 'value']"
            :loading="phenotypesStatus === 'pending'"
            placeholder="Select a phenotype"
            :search-input="{ placeholder: 'Search phenotypes' }"
            virtualize
            class="w-full"
          />
        </UFormField>
        <UFormField label="Ancestry">
          <USelect
            v-model="selectedAncestry"
            :items="ancestryItems"
            :loading="datasetsStatus === 'pending'"
            class="w-full"
          />
        </UFormField>
      </div>

      <UAlert
        v-if="phenotypesError"
        color="error"
        title="Phenotypes could not be loaded"
        description="BioIndex did not respond. Try again later."
        class="mt-6"
      />
      <p v-else-if="phenotypesStatus === 'pending'" class="mt-6 text-muted">
        Loading phenotypes…
      </p>
      <UAlert
        v-else-if="!state.phenotype"
        color="neutral"
        variant="subtle"
        title="Select a phenotype to view its results."
        class="mt-6"
      />
      <UAlert
        v-else-if="!phenotype"
        color="warning"
        :title="`Unknown phenotype: ${state.phenotype}`"
        description="Select a phenotype from the list."
        class="mt-6"
      />
      <template v-else>
        <UAlert
          v-if="unknownAncestry"
          color="warning"
          :title="`Unknown ancestry: ${ancestryLabel(state.ancestry)}`"
          description="Select an ancestry from the list."
          class="mt-6"
        />
        <section v-else class="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" aria-label="Association plots">
          <UCard v-for="plot in plots" :key="plot.url">
            <template #header>
              <h2 class="font-semibold">{{ plot.title }}</h2>
            </template>
            <p v-if="failedPlots.has(plot.url)" class="text-muted">
              No {{ plot.title }} available for this query.
            </p>
            <img
              v-else
              :src="plot.url"
              :alt="`${plot.title} for ${phenotype.description}`"
              class="w-full"
              @error="failedPlots = new Set(failedPlots).add(plot.url)"
            >
          </UCard>
        </section>
        <UModal v-model:open="provenanceOpen" title="Bottom-line provenance" description="Processing history and summary statistics for the selected phenotype and ancestry." :ui="{ content: 'max-w-6xl' }">
          <UButton color="neutral" variant="outline">Provenance &amp; summary statistics</UButton>
          <template #body>
            <BottomLineProvenance v-if="provenanceOpen" :phenotype="phenotype.name" :ancestry="state.ancestry" />
          </template>
        </UModal>
        <PhenotypeAssociations v-if="!unknownAncestry" :key="JSON.stringify([phenotype.name, state.ancestry])" :phenotype="phenotype" :ancestry="state.ancestry" />
        <PhenotypeGeneticSupport :key="phenotype.name" :phenotype="phenotype" :model="portal.geneticSupport" />
        <section class="space-y-2 rounded-lg border border-default p-4" aria-labelledby="genetic-factors-heading">
          <h2 id="genetic-factors-heading" class="text-xl font-semibold">Genetic factors</h2>
          <p class="text-sm text-muted">Explore the genetic factors underlying this phenotype on the legacy portal.</p>
          <a :href="legacyPhenotypeLink(phenotype.name)" class="text-primary underline">View genetic factors</a>
        </section>
        <PhenotypeCs2ct v-if="!unknownAncestry" :key="`cs2ct:${JSON.stringify([phenotype.name, state.ancestry])}`" :phenotype="phenotype" :ancestry="state.ancestry" />
        <section class="mt-10 space-y-4" aria-labelledby="associated-datasets-heading">
          <div class="space-y-1">
            <h2 id="associated-datasets-heading" class="text-xl font-semibold">Datasets with associations</h2>
            <p class="text-sm text-muted">
              Datasets reporting results for {{ phenotype.description }}<template v-if="state.ancestry">
                ({{ ancestryLabel(state.ancestry) }})
              </template>.
            </p>
          </div>
          <UAlert
            v-if="datasetsError"
            color="error"
            title="Datasets could not be loaded"
            description="BioIndex did not respond. Try again later."
          />
          <p v-else-if="datasetsStatus === 'pending'" class="text-muted">Loading datasets…</p>
          <p v-else-if="associatedDatasets.length === 0" class="text-muted">
            No datasets are available for this phenotype and ancestry.
          </p>
          <div v-else class="overflow-x-auto rounded-lg border border-default">
            <table class="w-full text-left text-sm">
              <thead class="bg-elevated text-muted">
                <tr>
                  <th scope="col" class="px-4 py-3 font-medium">Dataset</th>
                  <th scope="col" class="px-4 py-3 font-medium">Ancestry</th>
                  <th scope="col" class="px-4 py-3 text-right font-medium">Subjects</th>
                  <th scope="col" class="px-4 py-3 font-medium">Technology</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr v-for="dataset in associatedDatasets" :key="`${dataset.name}:${dataset.ancestry}`">
                  <td class="px-4 py-3">
                    <span class="font-medium">{{ dataset.name }}</span>
                    <p class="mt-1 text-muted">{{ dataset.description }}</p>
                  </td>
                  <td class="px-4 py-3">{{ ancestryLabel(dataset.ancestry) }}</td>
                  <td class="px-4 py-3 text-right tabular-nums">{{ dataset.subjects.toLocaleString() }}</td>
                  <td class="px-4 py-3">{{ dataset.technology }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <PhenotypePathways v-if="!unknownAncestry" :key="`pathways:${JSON.stringify([phenotype.name, state.ancestry])}`" :phenotype="phenotype" :ancestry="state.ancestry" />
        <PhenotypeGeneticCorrelations v-if="!unknownAncestry" :key="`correlations:${JSON.stringify([phenotype.name, state.ancestry])}`" :phenotype="phenotype" :phenotypes="phenotypes" :ancestry="state.ancestry" />
        <EffectorGeneLists :phenotype="phenotype.name" />
      </template>
    </ClientOnly>
  </div>
</template>
