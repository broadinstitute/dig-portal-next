import { createBioIndexClient } from '@dig-portal/api-clients'

export function useBioIndex() {
  const { bioindexUrl } = useRuntimeConfig().public
  return createBioIndexClient({ baseUrl: bioindexUrl })
}
