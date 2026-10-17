import { z } from 'zod';

import {
  attemptCreateRequestSchema,
  attemptResponseSchema,
  draftSaveRequestSchema,
  draftSaveResponseSchema,
  draftStateSchema,
  historyQuerySchema,
  historyResponseSchema,
  resumeResponseSchema,
  scenarioChoiceRequestSchema,
  scenarioChoiceResponseSchema,
  submitRequestSchema,
} from './content/v3/schema.js';

/**
 * HTTP contract of `api/v2/academy` (Học viện v3.2). Every wire shape is defined once in
 * `content/v3/schema.ts` §6 and re-exported here; this module only adds the path params and the
 * inferred request types the controller and service use.
 */
export {
  ACADEMY_ERROR_CODES,
  attemptCreateRequestSchema,
  attemptResponseSchema,
  catalogItemResponseSchema,
  catalogResponseSchema,
  draftSaveRequestSchema,
  draftSaveResponseSchema,
  draftStateSchema,
  examResponseSchema,
  historyQuerySchema,
  historyResponseSchema,
  itemIdSchema,
  itemResponseSchema,
  lessonContentResponseSchema,
  notesResponseSchema,
  notesSaveRequestSchema,
  progressItemSchema,
  progressResponseSchema,
  publicQuestionSchema,
  resumeResponseSchema,
  rewardResultSchema,
  scenarioChoiceRequestSchema,
  scenarioChoiceResponseSchema,
  submitRequestSchema,
  submitResponseSchema,
} from './content/v3/schema.js';
export type {
  AcademyErrorCode,
  CatalogItemResponse,
  CatalogResponse,
  ItemResponse,
  NotesResponse,
  NotesSaveRequest,
  ProgressResponse,
  PublicQuestion,
  RewardResult,
  SubmitResponse,
} from './content/v3/schema.js';

/** `:lessonId` path param: any item id (lesson, practice or chapter exam). */
export { itemIdSchema as lessonIdParamSchema } from './content/v3/schema.js';
export const attemptIdParamSchema = z.uuid();

export type AttemptCreateRequest = z.infer<typeof attemptCreateRequestSchema>;
export type DraftSaveRequest = z.infer<typeof draftSaveRequestSchema>;
export type SubmitRequest = z.infer<typeof submitRequestSchema>;
export type ScenarioChoiceRequest = z.infer<typeof scenarioChoiceRequestSchema>;
export type HistoryQuery = z.output<typeof historyQuerySchema>;
export type AttemptResponse = z.infer<typeof attemptResponseSchema>;
export type ResumeResponse = z.infer<typeof resumeResponseSchema>;
export type DraftState = z.infer<typeof draftStateSchema>;
export type DraftSaveResponse = z.infer<typeof draftSaveResponseSchema>;
export type HistoryResponse = z.infer<typeof historyResponseSchema>;
export type ScenarioChoiceResponse = z.infer<typeof scenarioChoiceResponseSchema>;
