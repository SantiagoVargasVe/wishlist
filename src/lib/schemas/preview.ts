import { z } from "zod";

export const previewSchema = z.object({
  url: z.url("Enter a valid URL"),
});

export type PreviewInput = z.infer<typeof previewSchema>;
