import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profilesRouter from "./profiles";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profilesRouter);

export default router;
