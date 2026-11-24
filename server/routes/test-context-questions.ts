/**
 * @module server/routes/test-context-questions
 * @description `GET /api/tests/:id/questions` — the questions of the topics a test references,
 * read IN THE CONTEXT of that test (role-model.md 6.5.1).
 *
 * The bank list `GET /api/questions` filters by the reader's TOPIC scope. This one is gated by
 * the TEST: whoever may edit the test reads the pools it draws from, with no access to the bank.
 * The gate is `edit`, not `read`: `canReadTest` also lets in a learner the test is assigned to,
 * and these rows carry the answer keys.
 */
import { Router, type Request, type Response } from "express";
import { requirePermission } from "../middleware/auth";
import { requireTestScope } from "../middleware/test-scope";
import { logger } from "../logger";
import { testContextQuestions } from "../services/test-topic-context";

const router = Router();

router.get(
  "/:id/questions",
  requirePermission("tests.edit"),
  requireTestScope("edit"),
  async (req: Request, res: Response) => {
    try {
      res.json(await testContextQuestions(req.effectiveRoles ?? [], req.currentUser?.id ?? "", req.params.id));
    } catch (error) {
      logger.error("Get test context questions error: " + (error as Error).message);
      res.status(500).json({ error: "Failed to get test questions" });
    }
  },
);

export default router;
