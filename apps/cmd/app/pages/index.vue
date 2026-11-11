<template>
  <div class="space-y-4">
    <h1 class="text-3xl font-semibold">CMD portal preview</h1>
    <p>The new portal is under construction.</p>
    <div class="flex flex-wrap gap-3">
      <UButton to="/phenotype?phenotype=CAD">
        Open the CAD phenotype preview
      </UButton>
      <UButton to="https://hugeamp.org/phenotype.html?phenotype=CAD" color="neutral" variant="outline">
        View the current CAD phenotype page
      </UButton>
    </div>
  </div>
</template>
