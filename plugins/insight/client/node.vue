<template>
  <g class="node" v-if="node.x && node.y">
    <circle
      :r="isActive ? 12 : 9"
      :cx="node.x"
      :cy="node.y"
    />
    <circle v-if="node.isGroup || node.isRoot"
      :r="isActive ? 8 : 5"
      :cx="node.x"
      :cy="node.y"
    />
    <g class="service" v-if="node.services">
      <line
        :x1="node.x - (isActive ? 5 : 4)"
        :y1="node.y"
        :x2="node.x + (isActive ? 5 : 4)"
        :y2="node.y"
      />
      <line
        :x1="node.x"
        :y1="node.y - (isActive ? 5 : 4)"
        :x2="node.x"
        :y2="node.y + (isActive ? 5 : 4)"
      />
    </g>
  </g>
</template>

<script lang="ts" setup>

import { Node } from './utils'

defineProps<{
  node: Node,
  isActive: boolean,
}>()

</script>

<style lang="scss" scoped>


g.node {
  circle {
    stroke: var(--k-page-bg);
    stroke-opacity: 1;
    stroke-width: 2;
    cursor: pointer;
    fill: var(--k-text-normal);
    transition: r 0.3s ease, opacity 0.3s ease, fill 0.3s ease, stroke 0.3s ease, box-shadow 0.3s ease;
  }

  &:hover {
    circle {
      fill: var(--k-fill-normal);
    }
  }

  .has-highlight &:not(.highlight) circle {
    opacity: 0.3;
  }

  .service line {
    stroke: var(--k-page-bg);
    stroke-opacity: 1;
    stroke-width: 2;
    transition: all 0.3s ease;
    stroke-linecap: round;
  }
}

</style>
