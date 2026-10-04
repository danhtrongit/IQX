import { randomInt } from 'node:crypto';

import { QUESTIONS_PER_LESSON, type AcademyQuestion } from './academy.content.js';

export type OptionOrders = Record<string, string[]>;
export type RandomInt = (maxExclusive: number) => number;

export type AttemptQuestionView = {
  id: string;
  question: string;
  options: { id: string; text: string }[];
};

export type SubmittedAnswer = { question_id: string; option_id: string };

export type GradedAnswer = {
  question_id: string;
  option_id: string;
  correct: boolean;
  correct_option_id: string;
  explanation: string;
};

export type InvalidAnswerIssue = {
  question_id: string;
  reason: 'unknown_question' | 'duplicate_question' | 'unknown_option' | 'missing_answer';
};

const secureRandomInt: RandomInt = (maxExclusive) => randomInt(0, maxExclusive);

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
 * Client view of an attempt: question text and options in the stored order only.
 * Returns null when the stored order no longer matches the question bank.
 */
export function attemptQuestionViews(
  questions: readonly AcademyQuestion[],
  questionIds: readonly string[],
  optionOrders: OptionOrders,
): AttemptQuestionView[] | null {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const views: AttemptQuestionView[] = [];
  for (const questionId of questionIds) {
    const question = byId.get(questionId);
    const order = optionOrders[questionId];
    if (!question || !order || order.length !== question.options.length) return null;
    const options = new Map(question.options.map((option) => [option.id, option.text]));
    const viewOptions: { id: string; text: string }[] = [];
    for (const optionId of order) {
      const text = options.get(optionId);
      if (text === undefined) return null;
      viewOptions.push({ id: optionId, text });
    }
    if (new Set(order).size !== order.length) return null;
    views.push({ id: question.id, question: question.question, options: viewOptions });
  }
  return views;
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
      correct_option_id: question.correct_option_id,
      explanation: question.explanation,
    };
  });
  const score = results.filter((result) => result.correct).length;
  return { score, passed: score === QUESTIONS_PER_LESSON && results.length === score, results };
}
