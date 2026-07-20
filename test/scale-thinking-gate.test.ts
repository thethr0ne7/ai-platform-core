import assert from "node:assert/strict";
import test from "node:test";
import { evaluateScaleThinkingPlan, type PlannedTask } from "../src/scale-thinking-gate.js";

function duplicateTask(index: number): PlannedTask {
  return {
    id: `task-${index}`,
    title: `Проверить гранты ${index}`,
    objective: "Найти и проверить гранты для сельского хозяйства",
    artifact: "Список грантов для сельского хозяйства",
    evidenceSources: []
  };
}

test("rejects task inflation with many near-identical tasks", () => {
  const result = evaluateScaleThinkingPlan({
    goal: "Построить инспектор мер поддержки",
    systemModel: "Система собирает официальные документы, сравнивает версии и связывает изменения с мерами поддержки.",
    leveragePoints: ["официальные источники"],
    tasks: Array.from({ length: 10 }, (_, index) => duplicateTask(index + 1)),
    maxParallelTasks: 3
  });

  assert.equal(result.decision, "reject");
  assert.equal(result.blockers.some((item) => item.includes("Task inflation")), true);
  assert.equal(result.taskAssessments.every((item) => item.recommendation === "merge"), true);
});

test("approves a smaller plan that expands depth, coverage and risk control", () => {
  const result = evaluateScaleThinkingPlan({
    goal: "Построить доказательный вертикальный срез Government Support Intelligence",
    systemModel: "Источник фиксируется как неизменяемый снимок. Экстракция отделена от интерпретации. Изменения проходят material diff. Рекомендация строится только после проверки требований, региона, заявителя и расходов.",
    leveragePoints: [
      "реестр официальных источников",
      "версионирование документов",
      "граф доказательств",
      "блокирующие критерии соответствия"
    ],
    tasks: [
      {
        id: "source-registry",
        title: "Зафиксировать официальные источники",
        objective: "Расширить покрытие первичных источников Минсельхоза и региональных органов",
        artifact: "Проверенный реестр источников с владельцем и расписанием проверки",
        evidenceSources: ["Минсельхоз России", "Минсельхоз КБР"],
        riskBoundary: "исключить агрегаторы и неофициальные публикации"
      },
      {
        id: "document-diff",
        title: "Версионировать документы",
        objective: "Выделять материальные изменения условий поддержки",
        artifact: "Набор неизменяемых версий и material diff",
        evidenceSources: ["официальные редакции нормативных документов"],
        dependencies: ["source-registry"],
        riskBoundary: "не смешивать редакции и даты вступления в силу"
      },
      {
        id: "evidence-trace",
        title: "Построить трассировку меры",
        objective: "Связать каждое условие меры с цитатой и официальным документом",
        artifact: "Граф measure → condition → quote → document",
        evidenceSources: ["тексты конкурсов", "постановления", "бюджетные документы"],
        dependencies: ["document-diff"],
        riskBoundary: "не допускать утверждений без подтверждённой цитаты"
      },
      {
        id: "recommendation",
        title: "Проверить проект пользователя",
        objective: "Выдать соответствие, блокеры и неопределённость для агропроекта",
        artifact: "Проверяемая карточка рекомендации с blockers и evidence",
        evidenceSources: ["условия меры", "профиль проекта"],
        dependencies: ["evidence-trace"],
        riskBoundary: "не выдавать потенциальное соответствие за одобрение"
      }
    ],
    maxParallelTasks: 3
  });

  assert.equal(result.decision, "approve");
  assert.equal(result.score >= 70, true);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.taskAssessments.every((item) => item.recommendation === "keep"), true);
});

test("rejects unjustified parallel expansion", () => {
  const tasks: PlannedTask[] = Array.from({ length: 5 }, (_, index) => ({
    id: `parallel-${index}`,
    title: `Параллельная задача ${index}`,
    objective: `Изолированная проверка источника ${index}`,
    artifact: `Отчёт по источнику ${index}`,
    evidenceSources: [`Источник ${index}`],
    parallelGroup: "research"
  }));

  const result = evaluateScaleThinkingPlan({
    goal: "Проверить источники",
    systemModel: "Каждый источник проверяется отдельно, но общий лимит параллельной работы защищает качество и контекст.",
    leveragePoints: ["покрытие источников"],
    tasks,
    maxParallelTasks: 3
  });

  assert.equal(result.decision, "reject");
  assert.equal(result.blockers.some((item) => item.includes("above limit")), true);
});
