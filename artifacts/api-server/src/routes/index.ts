import { Router, type IRouter } from "express";
import abstractlyRouter from "./abstractly";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(abstractlyRouter);

export default router;
