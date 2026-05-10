<template>
  <k-layout>
    <template #header>
      <span class="crumb">页面不存在</span>
    </template>
    <div class="not-found">
      <h1 class="code op-60 mb-4">404</h1>
      <div class="message">访问的页面不存在</div>
    </div>
  </k-layout>
</template>

<script lang="ts" setup>

</script>

<style lang="scss" scoped>

.not-found {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--text-secondary);
  user-select: none;
}

.code {
  font-size: 4rem;
  font-weight: 700;
  line-height: 1;
  color: var(--text-primary);
  letter-spacing: 0.05em;
}

.message {
  font-size: 1.125rem;
}

.path {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.875rem;
  color: var(--text-tertiary);
  padding: 0.25rem 0.625rem;
  border-radius: var(--radius-sm);
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-secondary);
  max-width: 80%;
  overflow-wrap: anywhere;
  text-align: center;
}

</style>
