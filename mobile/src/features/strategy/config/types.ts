export type Side = 'buy' | 'sell';
export type Op = '>' | '<' | '>=' | '<=';

export type Operand = { kind: string; key?: string; offset?: number; offset_param?: string; value?: number };
export type Rule = {
  id: string;
  kind: string;
  enabled?: boolean;
  lhs: Operand;
  rhs: Operand;
  op: string;
  allowed_ops?: string[];
};

export type RegistryField = {
  key: string;
  label: string;
  type: 'integer' | 'number' | string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  api_scale?: number;
  wire_unit?: string;
  options?: number[];
};

export type FieldOverride = { label?: string; min?: number; max?: number; step?: number };

export type RegistrySide = {
  enabled: boolean;
  params: Record<string, number>;
  rules: Rule[];
  field_overrides?: Record<string, FieldOverride>;
};

export type CrossField = { left: string; op: string; right: string };

export type RegistryIndicator = {
  id: string;
  name: string;
  chapter?: number;
  lesson_id?: string;
  family?: string;
  formula?: string;
  fields: RegistryField[];
  validation?: { cross_fields?: CrossField[] };
  buy: RegistrySide;
  sell: RegistrySide;
  learned?: boolean;
};

export type Registry = {
  calculation_version: string;
  rule_version: string;
  indicators: RegistryIndicator[];
};

export type SideConfig = { enabled: boolean; params: Record<string, number>; rules: Rule[] };
export type IndicatorConfig = { master_enabled: boolean; buy: SideConfig; sell: SideConfig };

export type SharedConfig = {
  saved_revision: number;
  effective_revision: number | null;
  effective_session: string | null;
  status: string;
  granted_indicators: string[];
  config: { indicators: Record<string, IndicatorConfig>; revision?: number };
};

export type Draft = Record<string, IndicatorConfig>;
/** Param values while editing: raw text so users can type partial numbers. */
export type ParamText = Record<string, Record<Side, Record<string, string>>>;
