import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("auto-unblock vendors", { minutes: 5 }, internal.vendors.processAutoUnblocks);

export default crons;
