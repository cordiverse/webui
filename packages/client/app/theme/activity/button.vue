<template>
  <component
    :is="data.id ? 'k-activity-link' : 'span'"
    class="activity-button"
    draggable="true"
    :id="data.id"
    :class="{ 'dragging': isDragging }"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd">
    <k-icon class="activity-button-icon" :name="data.icon"></k-icon>
  </component>
</template>

<script lang="ts" setup>

import { ref } from 'vue'
import { Activity } from '@cordisjs/client'

const props = defineProps<{
  data: Activity
}>()

const isDragging = ref(false)

function handleDragStart(event: DragEvent) {
  isDragging.value = true
  event.dataTransfer.setData('text/plain', 'activity:' + props.data.id)
}

function handleDragEnd(event: DragEvent) {
  isDragging.value = false
}

</script>

<style lang="scss" scoped>

.activity-button {
  height: calc(var(--nav-width) - 2 * var(--nav-icon-margin));
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  transition: var(--color-transition);
  color: var(--text-tertiary);
  border-radius: var(--radius-md);
  cursor: pointer;

  .activity-button-icon {
    height: var(--nav-icon-size);
    pointer-events: none;
  }

  &:hover, &.dragging {
    color: var(--text-primary);
    background-color: var(--bg-hover);
  }

  &.active {
    color: var(--accent);
    background-color: var(--accent-muted);
  }

  .badge {
    position: absolute;
    border-radius: 1rem;
    color: #ffffff;
    background-color: var(--k-color-danger);
    top: 50%;
    right: 1.5rem;
    transform: translateY(-50%);
    line-height: 1;
    padding: 4px 8px;
    font-size: 0.75rem;
    font-weight: bolder;
    transition: var(--color-transition);
  }

  &.is-group {
    &::before {
      content: "";
      position: absolute;
      right: 0;
      bottom: 4px;
      width: 0;
      height: 0;
      border: 4px solid;
      border-color: transparent transparent transparent currentColor;
      transition: var(--color-transition);
    }
  }
}

</style>
