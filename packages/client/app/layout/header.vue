<template>
  <div class="layout-header">
    <div class="layout-header-breadcrumb">
      <slot name="left">{{ route.name }}</slot>
    </div>
    <div class="layout-header-spacer"></div>
    <div class="layout-header-actions">
      <slot name="right"></slot>
    </div>
  </div>
</template>

<script lang="ts" setup>

import { useRoute } from 'vue-router'

const route = useRoute()

</script>

<style lang="scss">

.layout-header {
  flex: 0 0 auto;

  .menu-item {
    position: relative;
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-md);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-secondary);
    transition: var(--color-transition);

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }

    &.active {
      color: var(--accent);
    }

    &.spin .menu-icon {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    &.disabled {
      opacity: 0.3;
      pointer-events: none;
    }

    .menu-icon {
      height: 1rem;
      width: 1rem;
    }
  }
}

</style>
