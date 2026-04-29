import { ConflictException, Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";

type CreateUserInput = {
  email: string;
  password: string;
  displayName: string;
  role?: UserRole;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id }
    });
  }

  async create(input: CreateUserInput) {
    const email = input.email.toLowerCase();
    const existingUser = await this.findByEmail(email);

    if (existingUser) {
      throw new ConflictException("An account with this email already exists.");
    }

    return this.prisma.user.create({
      data: {
        email,
        displayName: input.displayName,
        passwordHash: await hash(input.password, 12),
        role: input.role ?? UserRole.USER
      }
    });
  }
}
