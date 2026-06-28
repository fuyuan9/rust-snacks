import {
  ArticleGenerator,
  runJobWithTracking,
  selectTopRepository,
} from "@rust-snacks/core";
import { DbClient } from "@rust-snacks/db";
import { RepositoryCollector, SnapshotTaker } from "@rust-snacks/github";
import type { Bindings } from "./types";

export interface QueueMessage {
  type:
    | "candidate_collection"
    | "repository_selection"
    | "snapshot"
    | "article_generation";
  repositoryId?: number;
}

export async function handleQueue(
  batch: MessageBatch<QueueMessage>,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<void> {
  const dbClient = new DbClient(env.DB);
  const githubToken = env.GITHUB_TOKEN; // optional secret
  const llmApiKey = env.LLM_API_KEY || ""; // required secret for generator

  for (const message of batch.messages) {
    const payload = message.body;

    try {
      switch (payload.type) {
        case "candidate_collection": {
          await runJobWithTracking(
            dbClient,
            "candidate_collection",
            null,
            async () => {
              const collector = new RepositoryCollector(githubToken);
              const count = await collector.collectCandidateRepositories(
                dbClient,
                100,
              );
              console.log(`Collected ${count} new candidate repositories.`);

              // Queue next step
              await env.QUEUE.send({ type: "repository_selection" });
            },
          );
          break;
        }

        case "repository_selection": {
          await runJobWithTracking(
            dbClient,
            "repository_selection",
            null,
            async () => {
              // Check for in-progress series first to prioritize continuation
              const activeSeries = await dbClient.getLatestActiveSeries();
              let selectedRepo = null;

              if (activeSeries) {
                console.log(
                  `Found active in-progress series: ID ${activeSeries.series_id}, Index ${activeSeries.series_index}/${activeSeries.series_total}`,
                );
                selectedRepo = await dbClient.getRepository(
                  activeSeries.repository_id,
                );
              }

              // Fallback to top scored repository
              if (!selectedRepo) {
                selectedRepo = await selectTopRepository(dbClient);
              }

              if (!selectedRepo) {
                console.log("No eligible repository found to select.");
                return;
              }

              console.log(
                `Selected repository: ${selectedRepo.owner}/${selectedRepo.name} (ID: ${selectedRepo.id})`,
              );

              // Queue next step
              await env.QUEUE.send({
                type: "snapshot",
                repositoryId: selectedRepo.id,
              });
            },
          );
          break;
        }

        case "snapshot": {
          const repoId = payload.repositoryId;
          if (!repoId)
            throw new Error("Repository ID is missing for snapshot job.");

          await runJobWithTracking(dbClient, "snapshot", repoId, async () => {
            const repo = await dbClient.getRepository(repoId);
            if (!repo) throw new Error(`Repository not found: ${repoId}`);

            const taker = new SnapshotTaker(githubToken);
            const commitSha = await taker.takeSnapshot(
              dbClient,
              env.BUCKET,
              repo.id,
              repo.owner,
              repo.name,
            );

            console.log(
              `Snapshot created for ${repo.owner}/${repo.name} at commit ${commitSha}`,
            );

            // Queue next step
            await env.QUEUE.send({
              type: "article_generation",
              repositoryId: repo.id,
            });
          });
          break;
        }

        case "article_generation": {
          const repoId = payload.repositoryId;
          if (!repoId)
            throw new Error(
              "Repository ID is missing for article_generation job.",
            );

          await runJobWithTracking(
            dbClient,
            "article_generation",
            repoId,
            async () => {
              const repo = await dbClient.getRepository(repoId);
              if (!repo) throw new Error(`Repository not found: ${repoId}`);

              const snapshot = await dbClient.getLatestSnapshot(repoId);
              if (!snapshot)
                throw new Error(`Snapshot not found for repository: ${repoId}`);

              const generator = new ArticleGenerator(
                llmApiKey,
                env.LLM_PROVIDER,
                env.LLM_MODEL,
              );
              const articleId = await generator.generateArticle(
                dbClient,
                env.BUCKET,
                repo,
                snapshot.commit_sha,
                {
                  readme: snapshot.readme,
                  cargo_toml: snapshot.cargo_toml,
                  main_rs: snapshot.main_rs,
                  lib_rs: snapshot.lib_rs,
                  file_tree_json: snapshot.file_tree_json,
                },
              );

              console.log(`Article generated successfully. ID: ${articleId}`);
            },
          );
          break;
        }

        default:
          console.error(`Unknown queue message type: ${(payload as any).type}`);
      }
    } catch (e: any) {
      console.error(
        `Failed to process message ${payload.type}: ${e.message}`,
        e,
      );
      // Re-throw so Cloudflare Queue handles retry / DLQ logic
      throw e;
    }
  }
}
