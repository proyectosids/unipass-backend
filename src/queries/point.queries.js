export const getPointsByExitIdQuery = `
SELECT * FROM Point WHERE IdExit = @IdSalida
`;
