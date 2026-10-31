export type Priority = "low" | "moderate" | "high" | "needs_review";

export interface Finding {
  id: number;
  image_id: number;
  defect_type: string;
  source_label: string | null;
  confidence: number | null;
  bbox: { x: number; y: number; width: number; height: number } | null;
  evidence_text: string | null;
  model_name: string | null;
  model_version: string | null;
  prediction_alternatives?: { source_label: string; label: string; score: number }[];
  priority: Priority;
  recommended_priority?: Priority;
  priority_override?: Priority | null;
  priority_override_reason?: string | null;
  next_action?: string;
  triage_rule_version?: string;
  priority_score: number;
  reason_codes: string[];
  reason_labels?: Record<string, string>;
  status: string;
  reviewer_note: string | null;
  is_sample: boolean;
  origin?: 'inspection' | 'inspector_annotation' | 'demo_seed' | string;
  created_at: string;
}

export interface FindingReviewEvent {
  id: number;
  finding_id: number;
  previous_status: string | null;
  next_status: string;
  previous_defect_type: string | null;
  next_defect_type: string | null;
  note: string | null;
  created_at: string;
}

export interface InspectionImage {
  id: number;
  url: string;
  filename: string;
  mime_type: string;
  width: number;
  height: number;
  byte_size: number;
  status: string;
  is_sample: boolean;
  created_at: string;
  findings: Finding[];
  quality_warnings?: string[];
  quality_flags?: { blurry?: boolean; dark?: boolean; overexposed?: boolean };
}

export interface Inspection {
  id: number;
  property_id: number;
  property_name: string | null;
  area_label: string;
  inspection_date: string;
  notes: string | null;
  context_flags: string[];
  status: string;
  created_at: string;
  completed_at: string | null;
  images: InspectionImage[];
  finding_count: number;
}

export interface PropertyRecord {
  id: number;
  name: string;
  property_type: string;
  location_label: string | null;
  age_band: string | null;
  notes: string | null;
  cover_image_url: string | null;
  is_demo?: boolean;
  demo_key?: string | null;
  created_at: string;
  updated_at: string;
  inspection_count: number;
  last_inspection_date: string | null;
  inspections?: Inspection[];
}

export interface User {
  id: number;
  name: string;
  email: string;
  is_demo: boolean;
}

export interface ModelStatus {
  ready: boolean;
  model_name: string;
  model_version: string;
  classes: string[];
  metrics?: {
    holdout_accuracy?: number;
    holdout_macro_f1?: number;
    holdout_size?: number;
    class_report?: Record<string, { precision?: number; recall?: number; ['f1-score']?: number; support?: number }>;
    confusion_matrix?: { labels: string[]; values: number[][] };
  } | null;
  dataset?: string;
  dataset_license?: string;
  dataset_rows_used?: number;
  feature_extractor?: string;
  classifier_type?: string;
  warning?: string;
}

export interface DashboardData {
  summary: {
    property_count: number;
    inspection_count: number;
    open_reviews: number;
    high_priority: number;
    review_completion: number | null;
  };
  properties: PropertyRecord[];
  recent_inspections: Inspection[];
  model: ModelStatus;
}

export interface DemoSample {
  id: string;
  label: string;
  url: string;
}

export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'completed';

export interface MaintenanceTask {
  id: number;
  property_id: number;
  property_name: string | null;
  inspection_id: number | null;
  finding_id: number | null;
  title: string;
  description: string | null;
  assignee: string | null;
  due_date: string | null;
  priority: Exclude<Priority, 'needs_review'>;
  status: TaskStatus;
  completion_note: string | null;
  created_at: string;
  updated_at: string;
}

export type TrendState = 'new' | 'recurring' | 'stable' | 'improved' | 'worsening' | 'unable_to_compare';

export interface IssueTrend {
  id: number;
  property_id: number;
  previous_finding_id: number;
  current_finding_id: number;
  trend_state: TrendState;
  attribution: 'inspector' | string;
  note: string | null;
  created_at: string;
}

export interface GuidedCase {
  property: PropertyRecord;
  previous_inspection_id: number | null;
  current_inspection_id: number | null;
  inspections: Inspection[];
  tasks: MaintenanceTask[];
  trends: IssueTrend[];
  fictional_demo: true;
  case_key: string;
}
