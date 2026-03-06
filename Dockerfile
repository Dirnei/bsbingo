# --- Build frontend ---
FROM node:20-alpine AS client-build
WORKDIR /app
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ .
RUN npm run build

# --- Build backend ---
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS server-build
WORKDIR /src
COPY src/BsBingo.Server/BsBingo.Server.csproj BsBingo.Server/
RUN dotnet restore BsBingo.Server/BsBingo.Server.csproj
COPY src/BsBingo.Server/ BsBingo.Server/
RUN dotnet publish BsBingo.Server/BsBingo.Server.csproj -c Release -o /app

# --- Runtime ---
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=server-build /app .
COPY --from=client-build /app/dist wwwroot/
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "BsBingo.Server.dll"]
