export class UserEntity {
  id!: string;
  nombre!: string;
  email!: string;
  fotoPerfil?: string | null;
  zona?: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}