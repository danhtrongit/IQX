import { randomInt } from 'node:crypto';

import { toPublicQuestion, type BankQuestion, type PublicQuestion } from './content/v3/schema.js';

export type OptionOrders = Record<string, string[]>;
export type RandomInt = (maxExclusive: number) => number;

export type SubmittedAnswer = { question_id: string; option_id: string };

export type GradedAnswer = {
  question_id: string;
  option_id: string;
  correct: boolean;
};

export type InvalidAnswerIssue = {
  question_id: string;
  reason: 'unknown_question' | 'duplicate_question' | 'unknown_option' | 'missing_answer';
};

export const secureRandomInt: RandomInt = (maxExclusive) => randomInt(0, maxExclusive);

/** Fisher–Yates shuffle with cryptographic randomness; returns a new array. */
export function shuffle<T>(items: readonly T[], random: RandomInt = secureRandomInt): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = random(index + 1);
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

/**
 * The order of one attempt: every question of the bank shuffled (academy_attempts.question_ids)
 * and each question's 3 options shuffled (academy_attempts.option_orders). Fixed for the attempt.
 * Option ids are salted, so the source order carries no information and is never re-rolled.
 */
export function buildAttemptOrder(
  questions: readonly BankQuestion[],
  random: RandomInt = secureRandomInt,
): { question_ids: string[]; option_orders: OptionOrders } {
  return {
    question_ids: shuffle(
      questions.map((question) => question.id),
      random,
    ),
    option_orders: Object.fromEntries(
      questions.map((question) => [
        question.id,
        shuffle(
          question.options.map((option) => option.id),
          random,
        ),
      ]),
    ),
  };
}

/**
 * Client view of an attempt: questions and options in the stored order, through
 * `toPublicQuestion` (id, prompt, options only). Null when the stored order no longer fits the bank.
 */
export function attemptQuestionViews(
  questions: readonly BankQuestion[],
  questionIds: readonly string[],
  optionOrders: OptionOrders,
): PublicQuestion[] | null {
  const byId = new Map(questions.map((question) => [question.id, question]));
  if (questionIds.length !== questions.length || new Set(questionIds).size !== questionIds.length)
    return null;
  const views: PublicQuestion[] = [];
  for (const questionId of questionIds) {
    const question = byId.get(questionId);
    const order = optionOrders[questionId];
    if (!question || !order || order.length !== question.options.length) return null;
    const known = new Set(question.options.map((option) => option.id));
    if (new Set(order).size !== order.length || order.some((id) => !known.has(id))) return null;
    views.push(toPublicQuestion(question, order));
  }
  return views;
}

/** Exactly one answer per attempt question, each option belonging to its question. */
export function findInvalidAnswers(
  questions: readonly BankQuestion[],
  questionIds: readonly string[],
  answers: readonly SubmittedAnswer[],
): InvalidAnswerIssue[] {
  const allowed = new Map(
    questions
      .filter((question) => questionIds.includes(question.id))
      .map((question) => [question.id, new Set(question.options.map((option) => option.id))]),
  );
  const issues: InvalidAnswerIssue[] = [];
  const seen = new Set<string>();
  for (const answer of answers) {
    const options = allowed.get(answer.question_id);
    if (!options) issues.push({ question_id: answer.question_id, reason: 'unknown_question' });
    else if (seen.has(answer.question_id))
      issues.push({ question_id: answer.question_id, reason: 'duplicate_question' });
    else if (!options.has(answer.option_id))
      issues.push({ question_id: answer.question_id, reason: 'unknown_option' });
    seen.add(answer.question_id);
  }
  for (const questionId of questionIds) {
    if (!seen.has(questionId)) issues.push({ question_id: questionId, reason: 'missing_answer' });
  }
  return issues;
}

/**
 * Draft selections may be partial: each one must name a question of the attempt (once) and an
 * option of that question. Missing answers are fine until submit.
 */
export function findInvalidDraftAnswers(
  questions: readonly BankQuestion[],
  questionIds: readonly string[],
  answers: readonly SubmittedAnswer[],
): InvalidAnswerIssue[] {
  return findInvalidAnswers(questions, questionIds, answers).filter(
    (issue) => issue.reason !== 'missing_answer',
  );
}

/** Grades validated answers in attempt question order. Pass requires every answer right. */
export function gradeAnswers(
  questions: readonly BankQuestion[],
  questionIds: readonly string[],
  answers: readonly SubmittedAnswer[],
): { score: number; passed: boolean; results: GradedAnswer[] } {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const chosen = new Map(answers.map((answer) => [answer.question_id, answer.option_id]));
  const results = questionIds.map((questionId): GradedAnswer => {
    const question = byId.get(questionId);
    const optionId = chosen.get(questionId);
    if (!question || optionId === undefined)
      throw new Error(`Cannot grade unvalidated answer for ${questionId}`);
    return {
      question_id: questionId,
      option_id: optionId,
      correct: optionId === question.correct_option_id,
    };
  });
  const score = results.filter((result) => result.correct).length;
  return { score, passed: results.length > 0 && score === results.length, results };
}
