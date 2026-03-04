FROM mcr.microsoft.com/dotnet/sdk:10.0-preview AS build
WORKDIR /src
COPY src/BsBingo.Server/BsBingo.Server.csproj BsBingo.Server/
RUN dotnet restore BsBingo.Server/BsBingo.Server.csproj
COPY src/BsBingo.Server/ BsBingo.Server/
RUN dotnet publish BsBingo.Server/BsBingo.Server.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0-preview
WORKDIR /app
COPY --from=build /app .
EXPOSE 8080
ENTRYPOINT ["dotnet", "BsBingo.Server.dll"]
