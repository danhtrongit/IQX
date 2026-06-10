<script setup lang="ts">
import { NDataTable, NPagination, NSpace } from "naive-ui"
import type { DataTableColumns } from "naive-ui"

defineProps<{
  columns: DataTableColumns<any>
  rows: any[]
  loading?: boolean
  page: number
  pageSize: number
  itemCount: number
  rowKey?: (row: any) => string | number
  checkedRowKeys?: Array<string | number>
}>()

const emit = defineEmits<{
  pageChange: [page: number]
  pageSizeChange: [pageSize: number]
  updateCheckedRowKeys: [keys: Array<string | number>]
}>()
</script>

<template>
  <n-space vertical size="medium">
    <n-data-table
      remote
      :columns="columns"
      :data="rows"
      :loading="loading"
      :row-key="rowKey"
      :checked-row-keys="checkedRowKeys"
      :bordered="true"
      :single-line="false"
      @update:checked-row-keys="(keys) => emit('updateCheckedRowKeys', keys)"
    />
    <div class="table-pagination">
      <n-pagination
        :page="page"
        :page-size="pageSize"
        :item-count="itemCount"
        :page-sizes="[10, 20, 50, 100]"
        show-size-picker
        @update:page="emit('pageChange', $event)"
        @update:page-size="emit('pageSizeChange', $event)"
      />
    </div>
  </n-space>
</template>

<style scoped>
.table-pagination {
  display: flex;
  justify-content: flex-end;
}
</style>
