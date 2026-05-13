<script setup lang="ts">
import { computed } from 'vue'
import { activate, instances, remove } from '../utils.ts'

const list = computed(() => {
  return Object.entries(instances.value)
    .map(([id, info]) => ({ id, ...info }))
    .sort((a, b) => b.lastVisit - a.lastVisit)
})

async function onCreate() {
  await activate()
}

async function onActivate(id: string) {
  await activate(id)
}

async function onRemove(id: string, event: MouseEvent) {
  event.stopPropagation()
  if (!confirm(`确定要删除实例 ${id} 吗?这将清除该实例所有数据。`)) return
  await remove(id)
}
</script>

<template>
  <k-layout>
    <template #header>
      <span class="crumb">实例</span>
    </template>

    <template #menu>
      <span class="menu-item" title="新建实例" @click="onCreate">
        <k-icon class="menu-icon" name="add" />
      </span>
    </template>

    <div class="content-area">
      <div class="content-body instance-list">
        <div
          v-for="item in list"
          :key="item.id"
          class="instance-card"
          @click="onActivate(item.id)"
        >
          <div class="instance-icon"><k-icon name="activity:instances" /></div>
          <div class="instance-meta">
            <div class="instance-name">{{ item.name }}</div>
            <div class="instance-time">
              {{ item.lastVisit ? new Date(item.lastVisit).toLocaleString() : '尚未访问' }}
            </div>
          </div>
          <button class="instance-remove" @click="onRemove(item.id, $event)" title="删除">
            <k-icon name="trash" />
          </button>
        </div>
        <div v-if="!list.length" class="empty">
          没有任何实例。点击右上角的「+」创建一个新实例。
        </div>
      </div>
    </div>
  </k-layout>
</template>

<style scoped lang="scss">
.instance-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  padding: 16px;
}

.instance-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  position: relative;

  &:hover {
    background: var(--bg-hover);
    border-color: var(--accent-muted);
  }
}

.instance-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--accent);
}

.instance-meta {
  flex: 1;
  min-width: 0;
}

.instance-name {
  color: var(--text-primary);
  font-weight: 500;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.instance-time {
  color: var(--text-tertiary, var(--text-secondary));
  font-size: 12px;
}

.instance-remove {
  background: none;
  border: none;
  color: var(--text-tertiary, var(--text-secondary));
  cursor: pointer;
  padding: 6px;
  border-radius: var(--radius-sm);

  &:hover {
    background: var(--bg-secondary);
    color: var(--error, var(--text-primary));
  }
}

.empty {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-secondary);
  padding: 48px 16px;
}
</style>
