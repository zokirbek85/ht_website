import { z } from "zod";

export const contactSchema = z.object({
  company: z.string().min(1),
  country: z.string().min(1),
  person: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  product: z.string().optional(),
  volume: z.string().optional(),
  message: z.string().optional()
});

export type ContactFormValues = z.infer<typeof contactSchema>;
