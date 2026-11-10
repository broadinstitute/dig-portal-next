<script setup lang="ts">
import portal from '../../portal.config'
</script>

<template>
  <div class="min-h-screen bg-default text-default">
    <header class="border-b border-default">
      <UContainer class="flex flex-wrap items-center justify-between gap-4 py-4">
        <span class="font-semibold">{{ portal.title }}</span>
        <nav aria-label="Primary">
          <a
            v-for="item in portal.navigation"
            :key="item.href"
            :href="item.href"
            class="text-sm text-muted hover:text-primary"
          >
            {{ item.label }}
          </a>
        </nav>
      </UContainer>
    </header>
    <main>
      <UContainer class="py-12">
        <slot />
      </UContainer>
    </main>
  </div>
</template>
