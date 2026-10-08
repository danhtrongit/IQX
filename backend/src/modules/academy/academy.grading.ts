import { randomInt } from 'node:crypto';

import type { AcademyQuestion, AcademyQuestionFigure } from './academy.banks.js';
import { QUESTIONS_PER_LESSON } from './academy.constants.js';

export type OptionOrders = Record<string, string[]>;
export type RandomInt = (maxExclusive: number) => number;

/** A question as served before submit: no answer key, no explanation, no source option ids. */
export type AttemptQuestionView = {
  id: string;
  topic: string | null;
  section: 1 | 2 | 3 | 4 | null;
  prompt: string;
  hint: string | null;
  figure: AcademyQuestionFigure | null;
  /** In the attempt's own order. */
  options: { id: string; text: string }[];
};

export type SubmittedAnswer = { question_id: string; option_id: string };

export type GradedAnswer = {
  question_id: string;
  option_id: string;
  correct: boolean;
};

export type ReviewOption = {
  id: string;
  text: string;
  /** This option is the one the learner chose. */
  chosen: boolean;
  /** This option is the right answer. */
  correct: boolean;
  /** Why this option is right or wrong (package banks); null for legacy banks. */
  explanation: string | null;
};

/** One question of a submitted attempt: the question as served plus the key and the explanations. */
export type ReviewItem = Omit<AttemptQuestionView, 'id' | 'options'> & {
  question_id: string;
  /** The option the learner chose. */
  option_id: string;
  correct: boolean;
  correct_option_id: string;
  /** Question-level explanation (legacy banks); null for package banks. */
  explanation: string | null;
  /** In the attempt's own order, so letters match what the learner saw. */
  options: ReviewOption[];
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

/** Per-attempt option order for every question (stored in academy_attempts.option_orders). */
export function buildOptionOrders(
  questions: readonly AcademyQuestion[],
  random: RandomInt = secureRandomInt,
): OptionOrders {
  return Object.fromEntries(
    questions.map((question) => [
      question.id,
      shuffle(
        question.options.map((option) => option.id),
        random,
      ),
    ]),
  );
}

/**
 * The order of one attempt: the same 8 questions shuffled (stored in academy_attempts.question_ids)
 * and each question's options shuffled (academy_attempts.option_orders). Fixed for the attempt.
 */
export function buildAttemptOrder(
  questions: readonly AcademyQuestion[],
  random: RandomInt = secureRandomInt,
): { question_ids: string[]; option_orders: OptionOrders } {
  return {
    question_ids: shuffle(
      questions.map((question) => question.id),
      random,
    ),
    option_orders: buildOptionOrders(questions, random),
  };
}

/** Questions of the attempt in the stored order, or null when the stored order no longer fits the bank. */
function orderedQuestions(
  questions: readonly AcademyQuestion[],
  questionIds: readonly string[],
  optionOrders: OptionOrders,
): Array<{ question: AcademyQuestion; order: string[] }> | null {
  const byId = new Map(questions.map((question) => [question.id, question]));
  if (questionIds.length !== questions.length || new Set(questionIds).size !== questionIds.length)
    return null;
  const ordered: Array<{ question: AcademyQuestion; order: string[] }> = [];
  for (const questionId of questionIds) {
    const question = byId.get(questionId);
    const order = optionOrders[questionId];
    if (!question || !order || order.length !== question.options.length) return null;
    const known = new Set(question.options.map((option) => option.id));
    if (new Set(order).size !== order.length || order.some((id) => !known.has(id))) return null;
    ordered.push({ question, order });
  }
  return ordered;
}

/**
 * Client view of an attempt: questions and options in the stored order only. The fields are listed
 * one by one on purpose, so a field added to the private question can never reach a client by accident.
 * Returns null when the stored order no longer matches the question bank.
 */
export function attemptQuestionViews(
  questions: readonly AcademyQuestion[],
  questionIds: readonly string[],
  optionOrders: OptionOrders,
): AttemptQuestionView[] | null {
  const ordered = orderedQuestions(questions, questionIds, optionOrders);
  if (!ordered) return null;
  return ordered.map(({ question, order }) => {
    const text = new Map(question.options.map((option) => [option.id, option.text]));
    return {
      id: question.id,
      topic: question.topic,
      section: question.section,
      prompt: question.prompt,
      hint: question.hint,
      figure: question.figure,
      options: order.map((id) => ({ id, text: text.get(id)! })),
    };
  });
}

/** Exactly one answer per attempt question, each option belonging to its question. */
export function findInvalidAnswers(
  questions: readonly AcademyQuestion[],
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
  questions: readonly AcademyQuestion[],
  questionIds: readonly string[],
  answers: readonly SubmittedAnswer[],
): InvalidAnswerIssue[] {
  return findInvalidAnswers(questions, questionIds, answers).filter(
    (issue) => issue.reason !== 'missing_answer',
  );
}

/** Grades validated answers in attempt question order. Pass requires 8/8. */
export function gradeAnswers(
  questions: readonly AcademyQuestion[],
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
  return { score, passed: score === QUESTIONS_PER_LESSON && results.length === score, results };
}

/**
 * The review of a submitted attempt, from the bank it was pinned to: per question in attempt
 * order, what was asked, what was chosen, the key and the explanations. Null when the stored order
 * or the stored answers no longer fit that bank.
 */
export function buildReview(
  questions: readonly AcademyQuestion[],
  questionIds: readonly string[],
  optionOrders: OptionOrders,
  answers: readonly GradedAnswer[],
): ReviewItem[] | null {
  const ordered = orderedQuestions(questions, questionIds, optionOrders);
  if (!ordered) return null;
  const byQuestion = new Map(answers.map((answer) => [answer.question_id, answer]));
  const items: ReviewItem[] = [];
  for (const { question, order } of ordered) {
    const answer = byQuestion.get(question.id);
    if (!answer) return null;
    const options = new Map(question.options.map((option) => [option.id, option]));
    items.push({
      question_id: question.id,
      topic: question.topic,
      section: question.section,
      prompt: question.prompt,
      hint: question.hint,
      figure: question.figure,
      option_id: answer.option_id,
      correct: answer.correct,
      correct_option_id: question.correct_option_id,
      explanation: question.explanation,
      options: order.map((id) => {
        const option = options.get(id)!;
        return {
          id,
          text: option.text,
          chosen: id === answer.option_id,
          correct: id === question.correct_option_id,
          explanation: option.explanation,
        };
      }),
    });
  }
  return items;
}
