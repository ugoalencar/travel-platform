# Forgot / Reset Password

Fluxo:
1. usuário informa email;
2. resposta genérica sem user enumeration;
3. token de alta entropia;
4. armazenar hash;
5. expiração curta;
6. uso único;
7. redefinir senha;
8. revogar sessões anteriores;
9. auditar.

Nunca enviar senha em texto ou logar token.
