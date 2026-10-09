#!/usr/bin/env node
import * as p from "@clack/prompts";
import { downloadTemplate } from "giget";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import pc from "picocolors";

/** GitHub template monorepo: org/repo */
const TEMPLATE_REPO = "travzhang/template";

const TEMPLATE_CHOICES = [
  {
    value: "admin",
    label: "Admin",
    hint: "React + TypeScript + Vite 管理后台",
  },
  {
    value: "app",
    label: "App",
    hint: "Expo + React Native 移动端",
  },
  {
    value: "full-stack",
    label: "Full Stack",
    hint: "全栈 MemShare 项目",
  },
] as const;

type TemplateId = (typeof TEMPLATE_CHOICES)[number]["value"];

const TEMPLATE_IDS = new Set<string>(TEMPLATE_CHOICES.map((t) => t.value));

function isTemplateId(value: string): value is TemplateId {
  return TEMPLATE_IDS.has(value);
}

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

  const argTemplate = process.argv[3]?.trim();

  let templateId: TemplateId;

  if (argTemplate) {
    if (!isTemplateId(argTemplate)) {
      p.cancel(
        `无效的模板: ${argTemplate}（可选: ${TEMPLATE_CHOICES.map((t) => t.value).join(", ")}）`,
      );
      process.exit(1);
    }
    templateId = argTemplate;
  } else {
    const templateAnswer = await p.select({
      message: "选择项目模板？",
      options: TEMPLATE_CHOICES.map((t) => ({
        value: t.value,
        label: t.label,
        hint: t.hint,
      })),
    });

    if (p.isCancel(templateAnswer)) {
      p.cancel("已取消");
      process.exit(0);
    }

    templateId = templateAnswer;
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
  const templateLabel =
    TEMPLATE_CHOICES.find((t) => t.value === templateId)?.label ?? templateId;
  spinner.start(`正在下载模板 ${templateLabel}…`);

  try {
    if (argName !== "." && !existsSync(targetDir)) {
      await mkdir(targetDir, { recursive: true });
    }

    await downloadTemplate(`gh:${TEMPLATE_REPO}/${templateId}`, {
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
