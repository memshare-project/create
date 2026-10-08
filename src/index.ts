#!/usr/bin/env node
import * as p from "@clack/prompts";
import { downloadTemplate } from "giget";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import pc from "picocolors";

/** GitHub template: org/repo 或 org/repo#branch */
const TEMPLATE = "rinlay/rinlay";

const PROJECT_NAME_RE =
  /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

function isValidProjectName(name: string): boolean {
  return PROJECT_NAME_RE.test(name);
}

function toDirName(name: string): string {
  return name.startsWith("@") ? name.split("/")[1]! : name;
}

async function updatePackageName(dir: string, name: string): Promise<void> {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return;

  const raw = await readFile(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as Record<string, unknown>;
  pkg.name = name;
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  console.log();
  p.intro(pc.bgCyan(pc.black(" create-memshare ")));

  const argName = process.argv[2]?.trim();

  let projectName: string;

  if (argName && argName !== ".") {
    if (!isValidProjectName(argName)) {
      p.cancel(`无效的项目名: ${argName}`);
      process.exit(1);
    }
    projectName = argName;
  } else if (argName === ".") {
    projectName = basename(process.cwd());
  } else {
    const answer = await p.text({
      message: "项目名称？",
      placeholder: "my-memshare-app",
      validate(value) {
        const v = value.trim();
        if (!v) return "请输入项目名称";
        if (!isValidProjectName(v)) {
          return "项目名需符合 npm package 命名规范（小写、可含 - _ .）";
        }
      },
    });

    if (p.isCancel(answer)) {
      p.cancel("已取消");
      process.exit(0);
    }

    projectName = answer.trim();
  }

  const targetDir =
    argName === "." ? process.cwd() : resolve(process.cwd(), toDirName(projectName));

  if (argName !== "." && existsSync(targetDir)) {
    const entries = await import("node:fs/promises").then((fs) =>
      fs.readdir(targetDir),
    );
    if (entries.length > 0) {
      p.cancel(`目录已存在且非空: ${targetDir}`);
      process.exit(1);
    }
  }

  const spinner = p.spinner();
  spinner.start("正在下载模板…");

  try {
    if (argName !== "." && !existsSync(targetDir)) {
      await mkdir(targetDir, { recursive: true });
    }

    await downloadTemplate(`gh:${TEMPLATE}`, {
      dir: targetDir,
      force: true,
    });

    await updatePackageName(targetDir, projectName);

    // 去掉模板自带的 git 历史（若有）
    const gitDir = join(targetDir, ".git");
    if (existsSync(gitDir)) {
      await rm(gitDir, { recursive: true, force: true });
    }

    spinner.stop("模板下载完成");
  } catch (error) {
    spinner.stop("下载失败");
    const message = error instanceof Error ? error.message : String(error);
    p.cancel(message);
    process.exit(1);
  }

  const rel =
    argName === "." ? "." : toDirName(projectName);

  p.outro(
    [
      pc.green("项目已创建！"),
      "",
      `  ${pc.cyan(`cd ${rel}`)}`,
      `  ${pc.cyan("pnpm install")}`,
      `  ${pc.cyan("pnpm dev")}`,
      "",
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
