import enUS from "@arco-design/web-react/es/locale/en-US"

/**
 * Global Arco defaults applied via `<ConfigProvider componentConfig=... locale=...>`.
 *
 * Density: the dense, Bloomberg-style terminal look comes (almost) entirely from
 * defaulting controls to `size="small"` here — NOT from custom CSS. Individual
 * dense tables can still opt down to `size="mini"` per instance.
 */
export const arcoComponentConfig: Record<string, Record<string, unknown>> = {
  Button: { size: "small" },
  Input: { size: "small" },
  InputNumber: { size: "small" },
  InputTag: { size: "small" },
  Select: { size: "small" },
  TreeSelect: { size: "small" },
  Cascader: { size: "small" },
  DatePicker: { size: "small" },
  TimePicker: { size: "small" },
  Table: { size: "small", borderCell: true },
  Pagination: { size: "small" },
  Radio: { size: "small" },
  Form: { size: "small" },
}

/**
 * Vietnamese locale for Arco's internal strings, layered over the English pack
 * (Arco ships no vi-VN). App-authored copy is already Vietnamese; this only
 * covers component-internal text (empty states, modal buttons, etc.).
 */
export const arcoLocale = {
  ...enUS,
  Empty: { ...enUS.Empty, description: "Không có dữ liệu" },
  Modal: { ...enUS.Modal, okText: "Đồng ý", cancelText: "Hủy" },
  Popconfirm: { ...enUS.Popconfirm, okText: "Đồng ý", cancelText: "Hủy" },
} as typeof enUS
