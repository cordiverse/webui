<template>
  <k-layout>
    <template #header>
      <span class="crumb">加载中</span>
    </template>
    <div class="loading">
      <div class="spinner"></div>
    </div>
  </k-layout>
</template>

<style lang="scss" scoped>

.loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}

.spinner {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  border: 3px solid var(--border-secondary);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

</style>
