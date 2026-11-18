function cpfValido(cpf){
    const validar = String(cpf).replace(/\D/g, '')
    if (validar.length !== 11 || /^(\d)\1{10}$/.test(validar)){
        return false;
    }
    const digito = (tamanho) => {
        let soma = 0
        for (let i = 0; i< tamanho; i++) soma += Number(validar[i]) * (tamanho + 1 - i);
        const resto = (soma * 10) % 11
        return resto === 10 ? 0 : resto;
    }
    return digito(9) === Number(validar[9]) && digito(10) === Number(validar[10])
}

module.exports = { cpfValido }