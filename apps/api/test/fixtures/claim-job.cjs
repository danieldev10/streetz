// Separate process models an ungraceful worker restart using a real DB lease.
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { JobQueueService } = require("../../dist/src/jobs/job-queue.service.js");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
async function main() {
  const job = await new JobQueueService(prisma).claim(120000, ["SUPPORT_REPLY_EMAIL"]);
  process.send(job);
  setInterval(() => {}, 1000);
}
main().catch(() => process.exit(1));
