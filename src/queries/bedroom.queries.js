export const getBedroomBySexoYNivelQuery = `
SELECT * FROM Bedroom WHERE NivelDormitorio = @Nivel AND Sexo = @Sexo
`;
