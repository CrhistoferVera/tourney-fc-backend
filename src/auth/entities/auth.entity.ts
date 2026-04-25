export class AuthResponse {
  id!: string;
  nombre!: string;
  email!: string;
  fotoPerfil?: string;
  zona?: string;
  mensaje?: string;
}

export class RegisterResponse extends AuthResponse {
  registrado!: boolean;
}

export class LoginResponse extends AuthResponse {
  // Por ahora sin token, luego agregarás: accessToken: string;
}